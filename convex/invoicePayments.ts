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

// Stripe payment links per invoice. Link + reconciliation state live on the
// invoice ledger (manifestEvents), matching the invoiceReminders precedent.
// Inbound Stripe webhooks are blocked (issue #52: the generated Convex webhook
// verifier cannot parse Stripe's `t=...,v1=...` signature and convex/http.ts is
// generated/owned), so confirmation is pulled from Stripe by an authenticated
// finance user and recorded through the governed Payment.record → Payment.settle
// commands; the PaymentSettled reaction applies the amount to the invoice.

const OPEN_INVOICE_STATUSES = new Set(["sent", "viewed", "overdue", "partial"]);
const MAX_SESSIONS_CHECKED = 24;

const EVENT = {
  linkCreated: "InvoicePaymentLinkCreated",
  reminderLinkPrepared: "InvoiceReminderPaymentLinkPrepared",
  stripePaymentRecorded: "InvoiceStripePaymentRecorded",
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
  failures: string[];
}

interface SessionRecord {
  sessionId: string;
  url: string;
  createdAt: number;
  amount: number;
}

interface LedgerView {
  sessions: SessionRecord[];
  reconciledSessionIds: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requireStripeEnvironment(): {
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

function safeProviderMessage(cause: unknown): string {
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

    const reconciledSessionIds = rows
      .filter((row) => row.type === EVENT.stripePaymentRecorded)
      .map((row) => stringValue(asRecord(row.payload).sessionId))
      .filter((sessionId): sessionId is string => sessionId !== null);

    return { sessions, reconciledSessionIds };
  },
});

export const recordLedgerEvent = internalMutation({
  args: {
    type: v.union(
      v.literal(EVENT.linkCreated),
      v.literal(EVENT.stripePaymentRecorded),
    ),
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

async function fetchStripeSession(
  sessionId: string,
  stripeSecretKey: string,
): Promise<Record<string, unknown> | null> {
  const query = new URLSearchParams({
    "expand[]": "payment_intent.payment_method",
  });
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}?${query}`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
  );
  if (response.status === 404) return null;
  const body = asRecord(await response.json().catch(() => null));
  if (!response.ok) {
    const error = asRecord(body.error);
    throw new Error(
      stringValue(error.message) ||
        `Stripe session lookup failed (${response.status}).`,
    );
  }
  return body;
}

function paymentMethodKind(session: Record<string, unknown>): string {
  const paymentIntent = asRecord(session.payment_intent);
  const paymentMethod = asRecord(paymentIntent.payment_method);
  const type = stringValue(paymentMethod.type);
  if (type === "card") return "card";
  if (type === "us_bank_account" || type === "customer_balance") return "ach";
  return type ? "other" : "card";
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

    const invoiceNumber = String(invoice.invoiceNumber || invoice._id);
    const amountDue = Number(invoice.amountDue);
    const amountCents = Math.round(amountDue * 100);
    if (amountCents <= 0) {
      throw new ConvexError("Invoice has no payable balance.");
    }

    const returnUrl = new URL(environment.appOrigin);
    returnUrl.searchParams.set("invoice_payment", "success");
    const cancelUrl = new URL(environment.appOrigin);
    cancelUrl.searchParams.set("invoice_payment", "cancelled");
    const body = new URLSearchParams({
      mode: "payment",
      success_url: returnUrl.toString(),
      cancel_url: cancelUrl.toString(),
      client_reference_id: String(invoice._id),
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amountCents),
      "line_items[0][price_data][product_data][name]": `Invoice ${invoiceNumber} balance`,
      "line_items[0][quantity]": "1",
      "payment_intent_data[metadata][invoiceId]": String(invoice._id),
      "payment_intent_data[metadata][tenantId]": invoice.tenantId,
    });
    const response = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${environment.stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const responseBody = asRecord(await response.json().catch(() => null));
    if (!response.ok) {
      const error = asRecord(responseBody.error);
      throw new ConvexError(
        stringValue(error.message) ||
          `Stripe payment link setup failed (${response.status}).`,
      );
    }
    const sessionId = stringValue(responseBody.id);
    const url = stringValue(responseBody.url);
    if (!sessionId || !url) {
      throw new ConvexError("Stripe did not return a payment link.");
    }

    await ctx.runMutation(internal.invoicePayments.recordLedgerEvent, {
      type: EVENT.linkCreated,
      invoiceId: args.invoiceId,
      payload: {
        tenantId: invoice.tenantId,
        sessionId,
        url,
        amount: amountDue,
        createdBy: auth.id,
      },
    });
    return { sessionId, url, createdAt: Date.now(), amount: amountDue };
  },
});

export const syncStripePayments = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<StripeSyncResult> => {
    const environment = requireStripeEnvironment();
    const invoice = await requireInvoice(ctx, args.invoiceId);
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
      failures: [],
    };

    for (const session of pending) {
      try {
        const stripeSession = await fetchStripeSession(
          session.sessionId,
          environment.stripeSecretKey,
        );
        if (!stripeSession || stripeSession.payment_status !== "paid") {
          continue;
        }
        const amountTotal = Number(stripeSession.amount_total);
        if (!Number.isFinite(amountTotal) || amountTotal <= 0) {
          throw new Error("Stripe reported a paid session without an amount.");
        }
        const amount = amountTotal / 100;
        const method = paymentMethodKind(stripeSession);

        // Governed command path: record + settle. The PaymentSettled reaction
        // applies the amount to the invoice balance and status. Command
        // idempotency keys make retries safe if a prior sync partially failed.
        const recordResult: { docId: Id<"payments"> } = await ctx.runMutation(
          api.mutations.Payment_createViaRecord,
          {
            invoiceId: String(invoice._id),
            clientId: String(invoice.clientId),
            amount,
            method,
            ...(invoice.eventId ? { eventId: String(invoice.eventId) } : {}),
            notes: `Stripe Checkout ${session.sessionId}`,
            idempotencyKey: `stripe-checkout/${session.sessionId}/record`,
          },
        );
        await ctx.runMutation(api.mutations.Payment_settle, {
          docId: recordResult.docId,
          idempotencyKey: `stripe-checkout/${session.sessionId}/settle`,
        });
        await ctx.runMutation(internal.invoicePayments.recordLedgerEvent, {
          type: EVENT.stripePaymentRecorded,
          invoiceId: args.invoiceId,
          payload: {
            tenantId: invoice.tenantId,
            sessionId: session.sessionId,
            paymentId: String(recordResult.docId),
            amount,
            method,
          },
        });
        result.recorded += 1;
        result.recordedAmount += amount;
      } catch (cause) {
        result.failures.push(
          `Session ${session.sessionId}: ${safeProviderMessage(cause)}`,
        );
      }
    }
    return result;
  },
});
