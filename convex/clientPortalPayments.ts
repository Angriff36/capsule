import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalQuery,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  reconcileCheckoutSession,
  requireConnectedAccountId,
  requireStripeEnvironment,
  safeProviderMessage,
  type LedgerView,
} from "./invoicePayments";
import { resolveClientPortalAccess } from "./lib/clientPortalLinks";
import {
  createCheckoutSession,
  fetchCheckoutSession,
  invoiceCheckoutCurrency,
  readCheckoutSession,
  toStripeAmount,
} from "./lib/stripeCheckout";

// PL-CLIENT-PAYMENT (AC-102): the client pays a deposit or the balance from
// the account-free portal link. The portal token is the only credential; it
// must name the invoice's own event and client. Money goes to the caterer's
// connected Stripe account in the invoice's currency. Pressing Pay twice,
// refreshing, or losing the answer never makes a second charge: an open
// checkout is reused, a paid one is recorded first, and each paid session is
// recorded once (convex/lib/invoiceStripeReconcile.ts).

const OPEN_INVOICE_STATUSES = new Set(["sent", "viewed", "overdue", "partial"]);
const SESSIONS_CHECKED = 5;
// Stripe Checkout sessions stay open for 24 hours.
const REUSE_WINDOW_MS = 23 * 60 * 60 * 1000;

export type PortalPayPart = "deposit" | "balance";

export interface PortalPayableParts {
  /** What is still owed of the deposit, or null when no deposit is due. */
  deposit: number | null;
  /** The full remaining balance, or 0 when nothing is owed. */
  balance: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** What a client can pay right now on this invoice. */
export function portalPayableParts(
  invoice: Pick<
    Doc<"invoices">,
    | "status"
    | "amountDue"
    | "amountPaid"
    | "depositAmount"
    | "depositPaidAt"
    | "deletedAt"
  >,
): PortalPayableParts {
  const open =
    invoice.deletedAt == null &&
    OPEN_INVOICE_STATUSES.has(String(invoice.status)) &&
    invoice.amountDue > 0;
  if (!open) return { deposit: null, balance: 0 };
  const depositLeft =
    invoice.depositPaidAt == null && (invoice.depositAmount ?? 0) > 0
      ? roundMoney(
          Math.min(
            (invoice.depositAmount ?? 0) - invoice.amountPaid,
            invoice.amountDue,
          ),
        )
      : 0;
  return {
    deposit: depositLeft > 0 ? depositLeft : null,
    balance: roundMoney(invoice.amountDue),
  };
}

/** True when this company can take card payments from the portal now. */
export async function portalCanPayOnline(
  ctx: QueryCtx,
  tenantId: string,
): Promise<boolean> {
  if (
    !process.env.STRIPE_SECRET_KEY?.trim() ||
    !process.env.CAPSULE_PUBLIC_APP_URL?.trim()
  ) {
    return false;
  }
  const rows = await ctx.db
    .query("integrationConnections")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const stripe = rows.find(
    (row) => row.provider === "stripe" && row.deletedAt == null,
  );
  return (
    stripe?.status === "connected" &&
    stripe.chargesEnabled === true &&
    typeof stripe.externalAccountId === "string" &&
    stripe.externalAccountId.trim().length > 0
  );
}

/** The invoice behind a portal link, or null when the link does not cover it. */
export const loadPortalInvoice = internalQuery({
  args: { token: v.string(), invoiceId: v.string() },
  handler: async (ctx, args): Promise<Doc<"invoices"> | null> => {
    const access = await resolveClientPortalAccess(ctx, args.token);
    if (!access) return null;
    const invoiceId = ctx.db.normalizeId("invoices", args.invoiceId);
    if (!invoiceId) return null;
    const invoice = await ctx.db.get(invoiceId);
    if (
      !invoice ||
      invoice.deletedAt != null ||
      invoice.tenantId !== access.tenantId ||
      String(invoice.eventId) !== access.eventId
    ) {
      return null;
    }
    const event = await ctx.db.get(invoice.eventId as Id<"events">);
    if (!event || event.clientId !== invoice.clientId) return null;
    return invoice;
  },
});

const UNAVAILABLE =
  "This payment isn't available from this link. Ask your catering contact for the current client link.";
const NOT_SET_UP =
  "Online payment isn't set up yet. Contact your catering team to pay.";

async function requirePortalInvoice(
  ctx: ActionCtx,
  token: string,
  invoiceId: string,
): Promise<Doc<"invoices">> {
  const invoice: Doc<"invoices"> | null = await ctx.runQuery(
    internal.clientPortalPayments.loadPortalInvoice,
    { token, invoiceId },
  );
  if (!invoice) throw new ConvexError(UNAVAILABLE);
  return invoice;
}

async function paymentSetup(ctx: ActionCtx, tenantId: string) {
  try {
    const environment = requireStripeEnvironment();
    const connectedAccountId = await requireConnectedAccountId(ctx, tenantId);
    return { ...environment, connectedAccountId };
  } catch {
    throw new ConvexError(NOT_SET_UP);
  }
}

export type StartPaymentResult =
  | { status: "checkout"; url: string; sessionId: string; amount: number }
  | { status: "nothing_due" }
  | { status: "processing" };

export const startPayment = action({
  args: {
    token: v.string(),
    invoiceId: v.string(),
    part: v.union(v.literal("deposit"), v.literal("balance")),
  },
  handler: async (ctx, args): Promise<StartPaymentResult> => {
    let invoice = await requirePortalInvoice(ctx, args.token, args.invoiceId);
    const setup = await paymentSetup(ctx, invoice.tenantId);
    const view: LedgerView = await ctx.runQuery(
      internal.invoicePayments.loadLedgerView,
      { invoiceId: invoice._id, tenantId: invoice.tenantId },
    );

    // Before making a new checkout, look at the recent ones. A paid one is
    // recorded now (the client paid, then lost the answer); an open one for
    // the same amount is handed back (double press, refresh).
    const reconciled = new Set(view.reconciledSessionIds);
    const recent = view.sessions
      .filter(
        (session) =>
          !reconciled.has(session.sessionId) &&
          session.createdAt > Date.now() - REUSE_WINDOW_MS,
      )
      .slice(0, SESSIONS_CHECKED);
    const open: Array<{ sessionId: string; url: string; amount: number }> = [];
    let clearing = false;
    let recordedAny = false;
    for (const session of recent) {
      let raw: Record<string, unknown> | null;
      try {
        raw = await fetchCheckoutSession(
          session.sessionId,
          setup.stripeSecretKey,
          setup.connectedAccountId,
        );
      } catch (cause) {
        throw new ConvexError(
          `We couldn't reach the card processor. Please try again. (${safeProviderMessage(cause)})`,
        );
      }
      const outcome = readCheckoutSession(raw).outcome;
      if (outcome === "succeeded") {
        await reconcileCheckoutSession(
          ctx,
          invoice,
          session.sessionId,
          setup.stripeSecretKey,
          setup.connectedAccountId,
        );
        recordedAny = true;
      } else if (outcome === "pending") {
        if (raw?.status === "open") open.push(session);
        else clearing = true;
      }
    }
    if (recordedAny) {
      invoice = await requirePortalInvoice(ctx, args.token, args.invoiceId);
    }
    if (clearing) return { status: "processing" };

    const parts = portalPayableParts(invoice);
    const amount = args.part === "deposit" ? parts.deposit : parts.balance;
    if (amount == null || amount <= 0) return { status: "nothing_due" };

    const reusable = open.find((session) => session.amount === amount);
    if (reusable) {
      return {
        status: "checkout",
        url: reusable.url,
        sessionId: reusable.sessionId,
        amount,
      };
    }

    const currency = invoiceCheckoutCurrency(invoice);
    const portalUrl = `${setup.appOrigin}/portal/events/${encodeURIComponent(args.token)}`;
    const invoiceNumber = String(invoice.invoiceNumber || invoice._id);
    // Two presses at the same moment see the same checkouts so far and send
    // the same key, so Stripe hands both the same checkout. Once that checkout
    // is saved, the count moves on, so a try after it expires gets a new one.
    const idempotencyKey = [
      "client-portal",
      String(invoice._id),
      args.part,
      toStripeAmount(amount, currency),
      toStripeAmount(invoice.amountPaid, currency),
      view.sessions.length,
    ].join("/");
    let created: { sessionId: string; url: string };
    try {
      created = await createCheckoutSession({
        stripeSecretKey: setup.stripeSecretKey,
        connectedAccountId: setup.connectedAccountId,
        invoice,
        amount,
        productName:
          args.part === "deposit"
            ? `Invoice ${invoiceNumber} deposit`
            : `Invoice ${invoiceNumber} balance`,
        // Stripe fills in {CHECKOUT_SESSION_ID}; the braces must stay as they are.
        successUrl: `${portalUrl}?payment=return&invoice=${encodeURIComponent(String(invoice._id))}&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${portalUrl}?payment=cancelled&invoice=${encodeURIComponent(String(invoice._id))}`,
        idempotencyKey,
      });
    } catch (cause) {
      throw new ConvexError(
        `We couldn't start the payment. Please try again. (${safeProviderMessage(cause)})`,
      );
    }
    await ctx.runMutation(internal.invoicePayments.recordLedgerEvent, {
      type: "InvoicePaymentLinkCreated",
      invoiceId: invoice._id,
      payload: {
        tenantId: invoice.tenantId,
        sessionId: created.sessionId,
        url: created.url,
        amount,
        part: args.part,
        createdBy: "client-portal",
      },
    });
    return { status: "checkout", ...created, amount };
  },
});

export interface CheckPaymentResult {
  outcome: "succeeded" | "pending" | "failed";
  amountPaid: number;
  amountDue: number;
  overpaid: number;
  currencyCode: string;
}

export const checkPayment = action({
  args: { token: v.string(), invoiceId: v.string(), sessionId: v.string() },
  handler: async (ctx, args): Promise<CheckPaymentResult> => {
    const invoice = await requirePortalInvoice(ctx, args.token, args.invoiceId);
    const view: LedgerView = await ctx.runQuery(
      internal.invoicePayments.loadLedgerView,
      { invoiceId: invoice._id, tenantId: invoice.tenantId },
    );
    if (
      !view.sessions.some((session) => session.sessionId === args.sessionId)
    ) {
      throw new ConvexError(
        "We couldn't find that payment. Ask your catering contact to check it.",
      );
    }
    const setup = await paymentSetup(ctx, invoice.tenantId);
    let checked: Awaited<ReturnType<typeof reconcileCheckoutSession>>;
    try {
      checked = await reconcileCheckoutSession(
        ctx,
        invoice,
        args.sessionId,
        setup.stripeSecretKey,
        setup.connectedAccountId,
      );
    } catch (cause) {
      throw new ConvexError(
        `We couldn't check this payment yet. Please try again. (${safeProviderMessage(cause)})`,
      );
    }
    const fresh = await requirePortalInvoice(ctx, args.token, args.invoiceId);
    return {
      outcome: checked.outcome,
      amountPaid: fresh.amountPaid,
      amountDue: fresh.amountDue,
      overpaid: checked.overpaid,
      currencyCode: invoiceCheckoutCurrency(fresh).toUpperCase(),
    };
  },
});
