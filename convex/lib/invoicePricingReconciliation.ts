/**
 * §8.2 invoice reconciliation for Event.changePricing (AC-388 invoice slice):
 * the approved event already carries one unsent draft invoice seeded from the
 * quoted price (invoice.manifest EventApproved cascade). When the price moves,
 * a draft still in that auto-made shape follows the new price through the
 * governed Invoice.followEventPrice command. Anything finance changed or
 * committed stays as it is: a draft with tax, discount, line items, a deposit,
 * a payment or a credit is flagged `invoice_review`; a sent or later invoice is
 * flagged `invoice_change_required` (a sent bill is history, AC-407).
 *
 * Only invoices whose total differs from the new price are in scope. Their
 * id + version are part of the input shape, so replaying the same price after
 * the draft followed is a no-op (nothing differs), and replaying it against an
 * unchanged flagged invoice finds the prior receipt and writes nothing.
 */
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type PricingReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type InvoiceRow = Doc<"invoices">;

const isZero = (value: number | null | undefined) => value == null || Number(value) === 0;

/** True for a draft nobody has touched since the approval cascade made it. */
function followsEventPrice(invoice: InvoiceRow): boolean {
  const lines = invoice.lineItems as unknown;
  return (
    invoice.status === "draft" &&
    invoice.sentAt == null &&
    isZero(invoice.amountPaid) &&
    isZero(invoice.taxAmount) &&
    isZero(invoice.discountAmount) &&
    isZero(invoice.amountCredited) &&
    isZero(invoice.depositAmount) &&
    (lines == null || (Array.isArray(lines) && lines.length === 0))
  );
}

/** Identity + exactly-once receipting for the invoice side of an Event price
 * change. Writes invoices only through Invoice.followEventPrice. */
export class EventInvoicePricingReconciliation {
  /** Runs in the originating Event command's transaction. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: PricingReconcileTrigger,
    quotedPrice: number,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    const invoices = (await ctx.db
      .query("invoices")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as InvoiceRow[];
    const differing = invoices.filter(
      (row) =>
        row.tenantId === event.tenantId &&
        row.deletedAt == null &&
        row.status !== "voided" &&
        Number(row.total) !== quotedPrice,
    );
    if (differing.length === 0) return;
    const windows: TimingWindow[] = [
      { key: "stage:" + event.stage, startsAt: null, endsAt: null },
      { key: "price", startsAt: quotedPrice, endsAt: null },
      ...differing.map((row) => ({
        key: "invoice:" + String(row._id),
        startsAt: row.version,
        endsAt: null,
      })),
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "invoice",
      checkpoint,
    );
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;

    let updatedCount = 0;
    const unresolved: ReconciliationReceiptOutput["unresolved"] = [];
    for (const invoice of differing) {
      if (followsEventPrice(invoice)) {
        await ctx.runMutation(api.mutations.Invoice_followEventPrice, {
          docId: invoice._id,
          version: invoice.version,
          total: quotedPrice,
        });
        updatedCount += 1;
        continue;
      }
      unresolved.push({
        code: invoice.status === "draft" ? "invoice_review" : "invoice_change_required",
        recordIds: [String(invoice._id)],
      });
    }
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["invoice"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: unresolved.length,
      exceptionCount: 0,
      unresolved,
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventInvoicePricingReconciliation = new EventInvoicePricingReconciliation();
