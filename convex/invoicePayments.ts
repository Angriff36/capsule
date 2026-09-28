import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  createCheckoutSession,
  fetchCheckoutSession,
  readCheckoutSession,
} from "./lib/stripeCheckout";
import { STRIPE_PAYMENT_RECORDED } from "./lib/invoiceStripeReconcile";

// Stripe payment links per invoice. Link + reconciliation state live on the
// invoice ledger (manifestEvents), matching the invoiceReminders precedent.
// Inbound Stripe webhooks are blocked (issue #52: the generated Convex webhook
// verifier cannot parse Stripe's `t=...,v1=...` signature and convex/http.ts is
// generated/owned), so confirmation is pulled from Stripe by an authenticated
// finance user (or by the client returning to the portal, see
// convex/clientPortalPayments.ts) and recorded once per session by
// convex/lib/invoiceStripeReconcile.ts through the governed Payment.record →
// Payment.settle commands; the PaymentSettled reaction applies the amount.
//
// Funds settle to the TENANT, not the platform (issue #112): every Stripe call
// carries a `Stripe-Account` header naming the tenant's Standard connected
// account, resolved from its IntegrationConnection row (spec §12.1). A tenant
// without a charges-enabled connection cannot create a payment link at all —
// see `requireConnectedAccountId`. Onboarding lives in `convex/stripeConnect.ts`.

const OPEN_INVOICE_STATUSES = new Set(["sent", "viewed", "overdue", "partial"]);
const MAX_SESSIONS_CHECKED = 24;

const EVENT = {
  linkCreated: "InvoicePaymentLinkCreated",
  reminderLinkPrepared: "InvoiceReminderPaymentLinkPrepared",
  stripePaymentRecorded: STRIPE_PAYMENT_RECORDED,
} as const;

export interface PaymentLinkView {
  sessionId: string;
  url: string;
  createdAt: number;
  amount: number;
}

export interface StripeSyncResult {
  checked: number;
  recorded: number;
  recordedAmount: number;
  /** Paid by card beyond what was owed; staff refund it in Stripe. */
  overpaidAmount: number;
  failures: string[];
}

export interface SessionRecord {
  sessionId: string;
  url: string;
  createdAt: number;
  amount: number;
}

export interface LedgerView {
  sessions: SessionRecord[];
  reconciledSessionIds: string[];
  overpaidAmount: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function requireStripeEnvironment(): {
  stripeSecretKey: string;
  appOrigin: string;
} {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const rawOrigin = process.env.CAPSULE_PUBLIC_APP_URL?.trim();
  if (!stripeSecretKey || !rawOrigin) {
    throw new ConvexError(
      "Invoice payment links need STRIPE_SECRET_KEY and CAPSULE_PUBLIC_APP_URL in the Convex environment.",
    );
  }
  let appOrigin: string;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("unsupported protocol");
    }
    appOrigin = parsed.origin;
  } catch {
    throw new ConvexError(
      "CAPSULE_PUBLIC_APP_URL must be a valid HTTP(S) application origin.",
    );
  }
  return { stripeSecretKey, appOrigin };
}

export function safeProviderMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.replace(/[\r\n]+/gu, " ").slice(0, 300);
}

function assertPayableInvoice(invoice: Doc<"invoices">): void {
  if (
    invoice.deletedAt != null ||
    !OPEN_INVOICE_STATUSES.has(String(invoice.status)) ||
    Number(invoice.amountDue) <= 0 ||
    invoice.paidAt != null
  ) {
    throw new ConvexError(
      "Payment links are available only for a sent invoice with a balance due.",
    );
  }
}

/** Read-policy-enforced invoice load plus explicit tenant match (sendNow precedent). */
async function requireInvoice(
  ctx: ActionCtx,
  invoiceId: Id<"invoices">,
): Promise<Doc<"invoices">> {
  const auth = await getAuthContext(ctx);
  const invoice = await ctx.runQuery(api.queries.getInvoice, {
    id: invoiceId,
  });
  if (!invoice || !auth.tenantId || auth.tenantId !== invoice.tenantId) {
    throw new ConvexError("Invoice unavailable. Check your workspace access.");
  }
  return invoice;
}

export const loadLedgerView = internalQuery({
  args: { invoiceId: v.id("invoices"), tenantId: v.string() },
  handler: async (ctx, args): Promise<LedgerView> => {
    const ledgerRows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", String(args.invoiceId)))
      .collect();
    const rows = ledgerRows
      .filter(
        (row) =>
          row.entity === "Invoice" &&
          asRecord(row.payload).tenantId === args.tenantId,
      )
      .sort((left, right) => right.createdAt - left.createdAt);

    const sessions: SessionRecord[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (
        row.type !== EVENT.linkCreated &&
        row.type !== EVENT.reminderLinkPrepared
      ) {
        continue;
      }
      const payload = asRecord(row.payload);
      const sessionId = stringValue(payload.sessionId);
      const url = stringValue(payload.url);
      if (!sessionId || !url || seen.has(sessionId)) continue;
      seen.add(sessionId);
      sessions.push({
        sessionId,
        url,
        createdAt: row.createdAt,
        amount: typeof payload.amount === "number" ? payload.amount : 0,
      });
    }

    const recordedRows = rows.filter(
      (row) => row.type === EVENT.stripePaymentRecorded,
    );
    const reconciledSessionIds = recordedRows
      .map((row) => stringValue(asRecord(row.payload).sessionId))
      .filter((sessionId): sessionId is string => sessionId !== null);
    const overpaidAmount = recordedRows.reduce((total, row) => {
      const overpaid = asRecord(row.payload).overpaid;
      return total + (typeof overpaid === "number" ? overpaid : 0);
    }, 0);

    return { sessions, reconciledSessionIds, overpaidAmount };
  },
});

export const recordLedgerEvent = internalMutation({
  args: {
    type: v.literal(EVENT.linkCreated),
    invoiceId: v.id("invoices"),
    payload: v.any(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.insert("manifestEvents", {
      type: args.type,
      entity: "Invoice",
      entityId: String(args.invoiceId),
      payload: args.payload,
      createdAt: Date.now(),
    });
  },
});

/**
 * The tenant's Stripe Connect account id (issue #112). Direct charges are made
 * with the platform key plus a `Stripe-Account` header so the money settles to
 * the caterer, not to Capsule. Throws rather than silently charging into the
 * platform account.
 */
export async function requireConnectedAccountId(
  ctx: ActionCtx,
  tenantId: string,
): Promise<string> {
  const connection = await ctx.runQuery(
    internal.stripeConnect.loadStripeConnection,
    { tenantId },
  );
  const accountId =
    typeof connection?.externalAccountId === "string"
      ? connection.externalAccountId.trim()
      : "";
  if (!connection || !accountId) {
    throw new ConvexError(
      "Connect this workspace's Stripe account before taking payments (Admin → Integrations).",
    );
  }
  if (connection.status !== "connected" || !connection.chargesEnabled) {
    throw new ConvexError(
      "This workspace's Stripe account cannot accept charges yet. Finish Stripe onboarding in Admin → Integrations.",
    );
  }
  return accountId;
}

/**
 * One paid-session check shared by staff sync and the client portal: read the
 * session from Stripe, then record it once through recordPaidSession.
 */
export async function reconcileCheckoutSession(
  ctx: ActionCtx,
  invoice: Doc<"invoices">,
  sessionId: string,
  stripeSecretKey: string,
  connectedAccountId: string,
): Promise<{
  outcome: "succeeded" | "pending" | "failed";
  recorded: boolean;
  applied: number;
  overpaid: number;
}> {
  const view = readCheckoutSession(
    await fetchCheckoutSession(sessionId, stripeSecretKey, connectedAccountId),
  );
  if (view.outcome !== "succeeded") {
    return { outcome: view.outcome, recorded: false, applied: 0, overpaid: 0 };
  }
  const result: { recorded: boolean; applied: number; overpaid: number } =
    await ctx.runMutation(
      internal.lib.invoiceStripeReconcile.recordPaidSession,
      {
        invoiceId: invoice._id,
        tenantId: invoice.tenantId,
        sessionId,
        amount: view.amount,
        method: view.method,
      },
    );
  return { outcome: "succeeded", ...result };
}

export const getPaymentLink = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<PaymentLinkView | null> => {
    const invoice = await requireInvoice(ctx, args.invoiceId);
    const view: LedgerView = await ctx.runQuery(
      internal.invoicePayments.loadLedgerView,
      { invoiceId: args.invoiceId, tenantId: invoice.tenantId },
    );
    const latest = view.sessions[0];
    return latest ?? null;
  },
});

export const createPaymentLink = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<PaymentLinkView> => {
    const environment = requireStripeEnvironment();
    const auth = await getAuthContext(ctx);
    const invoice = await requireInvoice(ctx, args.invoiceId);
    assertPayableInvoice(invoice);
    const connectedAccountId = await requireConnectedAccountId(
      ctx,
      invoice.tenantId,
    );

    const invoiceNumber = String(invoice.invoiceNumber || invoice._id);
    const amountDue = Number(invoice.amountDue);
    if (amountDue <= 0) {
      throw new ConvexError("Invoice has no payable balance.");
    }

    const returnUrl = new URL(environment.appOrigin);
    returnUrl.searchParams.set("invoice_payment", "success");
    const cancelUrl = new URL(environment.appOrigin);
    cancelUrl.searchParams.set("invoice_payment", "cancelled");
    let created: { sessionId: string; url: string };
    try {
      created = await createCheckoutSession({
        stripeSecretKey: environment.stripeSecretKey,
        connectedAccountId,
        invoice,
        amount: amountDue,
        productName: `Invoice ${invoiceNumber} balance`,
        successUrl: returnUrl.toString(),
        cancelUrl: cancelUrl.toString(),
      });
    } catch (cause) {
      throw new ConvexError(safeProviderMessage(cause));
    }

    await ctx.runMutation(internal.invoicePayments.recordLedgerEvent, {
      type: EVENT.linkCreated,
      invoiceId: args.invoiceId,
      payload: {
        tenantId: invoice.tenantId,
        sessionId: created.sessionId,
        url: created.url,
        amount: amountDue,
        createdBy: auth.id,
      },
    });
    return { ...created, createdAt: Date.now(), amount: amountDue };
  },
});

export const syncStripePayments = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<StripeSyncResult> => {
    const environment = requireStripeEnvironment();
    const invoice = await requireInvoice(ctx, args.invoiceId);
    const connectedAccountId = await requireConnectedAccountId(
      ctx,
      invoice.tenantId,
    );
    const view: LedgerView = await ctx.runQuery(
      internal.invoicePayments.loadLedgerView,
      { invoiceId: args.invoiceId, tenantId: invoice.tenantId },
    );
    const reconciled = new Set(view.reconciledSessionIds);
    const pending = view.sessions
      .filter((session) => !reconciled.has(session.sessionId))
      .slice(0, MAX_SESSIONS_CHECKED);

    const result: StripeSyncResult = {
      checked: pending.length,
      recorded: 0,
      recordedAmount: 0,
      overpaidAmount: 0,
      failures: [],
    };

    for (const session of pending) {
      try {
        const checked = await reconcileCheckoutSession(
          ctx,
          invoice,
          session.sessionId,
          environment.stripeSecretKey,
          connectedAccountId,
        );
        if (!checked.recorded) continue;
        result.recorded += 1;
        result.recordedAmount += checked.applied;
        result.overpaidAmount += checked.overpaid;
      } catch (cause) {
        result.failures.push(
          `Session ${session.sessionId}: ${safeProviderMessage(cause)}`,
        );
      }
    }
    return result;
  },
});
