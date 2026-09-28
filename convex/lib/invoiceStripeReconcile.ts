/**
 * AUTHOR SEAM — record one paid Stripe Checkout session on its invoice, once
 * (PL-CLIENT-PAYMENT, AC-102).
 *
 * Staff sync, the client's return to the portal and any replay of either all
 * land here. One transaction checks the invoice ledger for the session, then
 * records and settles the payment through the generated Payment commands as
 * the tenant's system role (Stripe confirmed the money, not a person); the
 * PaymentSettled reaction lowers the balance. A replay finds the ledger row
 * and changes nothing.
 *
 * Paid more than owed (two links paid for the same balance): only what is
 * still owed is applied; the rest is saved on the invoice ledger as an
 * overpayment so staff refund it in Stripe. Nothing is lost and nothing is
 * applied twice.
 */
import { v } from "convex/values";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation, type QueryCtx } from "../_generated/server";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

export const STRIPE_PAYMENT_RECORDED = "InvoiceStripePaymentRecorded";

const OPEN_INVOICE_STATUSES = new Set(["sent", "viewed", "overdue", "partial"]);

export interface RecordedSession {
  recorded: boolean;
  applied: number;
  overpaid: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** The ledger row that says this session was already recorded, if any. */
export async function findRecordedSession(
  ctx: QueryCtx,
  invoiceId: Id<"invoices">,
  tenantId: string,
  sessionId: string,
): Promise<RecordedSession | null> {
  const rows = await ctx.db
    .query("manifestEvents")
    .withIndex("by_entityId", (q) => q.eq("entityId", String(invoiceId)))
    .collect();
  for (const row of rows) {
    if (row.entity !== "Invoice" || row.type !== STRIPE_PAYMENT_RECORDED) {
      continue;
    }
    const payload = asRecord(row.payload);
    if (payload.tenantId !== tenantId || payload.sessionId !== sessionId) {
      continue;
    }
    return {
      recorded: false,
      applied: typeof payload.amount === "number" ? payload.amount : 0,
      overpaid: typeof payload.overpaid === "number" ? payload.overpaid : 0,
    };
  }
  return null;
}

export const recordPaidSession = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    tenantId: v.string(),
    sessionId: v.string(),
    amount: v.number(),
    method: v.union(v.literal("card"), v.literal("ach"), v.literal("other")),
  },
  returns: v.object({
    recorded: v.boolean(),
    applied: v.number(),
    overpaid: v.number(),
  }),
  handler: async (ctx, args): Promise<RecordedSession> => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.tenantId !== args.tenantId) {
      throw new Error("Invoice unavailable.");
    }
    const earlier = await findRecordedSession(
      ctx,
      args.invoiceId,
      args.tenantId,
      args.sessionId,
    );
    if (earlier) return earlier;

    const payable =
      invoice.deletedAt == null &&
      OPEN_INVOICE_STATUSES.has(String(invoice.status));
    const applied = payable
      ? roundMoney(Math.min(args.amount, Math.max(0, invoice.amountDue)))
      : 0;
    const overpaid = roundMoney(args.amount - applied);

    let paymentId: string | null = null;
    if (applied > 0) {
      const system = TenantSystemCommandRunner.forTenant(
        ctx,
        invoice.tenantId,
      ).context;
      // Keys match the earlier staff sync, so a payment it recorded before
      // stopping is finished here, never recorded a second time.
      const recorded = (await system.runMutation(
        api.mutations.Payment_createViaRecord,
        {
          invoiceId: String(invoice._id),
          clientId: String(invoice.clientId),
          amount: applied,
          method: args.method,
          ...(invoice.eventId ? { eventId: String(invoice.eventId) } : {}),
          notes:
            overpaid > 0
              ? `Stripe Checkout ${args.sessionId} (paid ${args.amount}; ${overpaid} more than owed - refund it in Stripe)`
              : `Stripe Checkout ${args.sessionId}`,
          idempotencyKey: `tenant-shared/stripe-checkout/${args.sessionId}/record`,
        },
      )) as { docId: Id<"payments"> };
      await system.runMutation(api.mutations.Payment_settle, {
        docId: recorded.docId,
        idempotencyKey: `tenant-shared/stripe-checkout/${args.sessionId}/settle`,
      });
      paymentId = String(recorded.docId);
    }

    await ctx.db.insert("manifestEvents", {
      type: STRIPE_PAYMENT_RECORDED,
      entity: "Invoice",
      entityId: String(args.invoiceId),
      payload: {
        tenantId: invoice.tenantId,
        sessionId: args.sessionId,
        paymentId,
        amount: applied,
        paidAmount: args.amount,
        overpaid,
        method: args.method,
      },
      createdAt: Date.now(),
    });
    return { recorded: true, applied, overpaid };
  },
});
