/**
 * AC-388 readiness slice: the invoice, proposal and closeout reconciliations
 * (invoicePricingReconciliation, proposalReconciliation,
 * closeoutCommercialReconciliation) keep a record a person changed or sent and
 * flag it on the newest section 8.2 receipt instead of rewriting it. This reads
 * those flags back for the live readiness view (section 8.3: the operator sees
 * the affected exception). A flag is still open only while the event still
 * holds the value that raised it AND the flagged record is unchanged since
 * (same version, not deleted). Once a person edits the record, or the event
 * moves back, the flag goes. An accepted proposal cannot be edited, so its
 * flag goes once a live change draft replaces it (convex/lib/proposalChangeDraft.ts).
 */
import type { QueryCtx } from "../_generated/server";
import { requestKey } from "./materializationReceipt";
import {
  EventReconciliationReceipt,
  type ReconciliationReceiptOutput,
} from "./reconciliationReceipt";

export type ReconciliationFlagDomain = "invoice" | "proposal" | "closeout";
export type ReconciliationFlag = {
  domain: ReconciliationFlagDomain;
  code: string;
  recordId: string;
  /** The flagged record's status now; the readiness view picks the action
   * that is legal in that status. */
  status: string;
  /** Invoices only: Invoice.followEventPrice may run on this draft (its
   * guards: no tax, discount, payment or credit, not sent). */
  canFollowPrice?: boolean;
};

type FlaggableRow = {
  _id: unknown;
  version?: number | null;
  deletedAt?: unknown;
  status?: unknown;
  replacesProposalId?: unknown;
  sentAt?: unknown;
  amountPaid?: number | null;
  taxAmount?: number | null;
  discountAmount?: number | null;
  amountCredited?: number | null;
};

const isZero = (value: number | null | undefined) =>
  value == null || Number(value) === 0;

/** Mirrors the Invoice.followEventPrice guards in src/sales/invoice-core.manifest. */
const canFollowPrice = (row: FlaggableRow) =>
  row.status === "draft" &&
  row.sentAt == null &&
  isZero(row.amountPaid) &&
  isZero(row.taxAmount) &&
  isZero(row.discountAmount) &&
  isZero(row.amountCredited);
type EventFacts = {
  quotedPrice?: number | null;
  budgetAmount?: number | null;
  expectedHeadcount?: number | null;
};

/** The event value each trigger window recorded, read from the live event. */
const TRIGGER_FACTS: Record<string, (event: EventFacts) => number | null> = {
  price: (event) => event.quotedPrice ?? null,
  headcount: (event) => event.expectedHeadcount ?? null,
  budgetedRevenue: (event) => event.quotedPrice ?? null,
  budgetedCost: (event) => event.budgetAmount ?? null,
};

/** True when every trigger window of the receipt holds the live event value. */
function matchesEvent(
  receipt: ReconciliationReceiptOutput,
  event: EventFacts,
): boolean {
  const windows = receipt.inputVersions?.windows ?? [];
  const triggers = windows.filter((window) => TRIGGER_FACTS[window.key]);
  return (
    triggers.length > 0 &&
    triggers.every(
      (window) => TRIGGER_FACTS[window.key]!(event) === window.startsAt,
    )
  );
}

/** The newest receipt of this event + domain written for the value the event
 * holds now. Not simply the head row: when the value goes back to one seen
 * before, the reconciliation finds its earlier receipt and writes nothing, so
 * the head still holds the value in between. */
async function receiptForEvent(
  ctx: QueryCtx,
  tenantId: string,
  eventId: string,
  domain: ReconciliationFlagDomain,
  event: EventFacts,
): Promise<ReconciliationReceiptOutput | null> {
  // Exact receipt keys end in a hex checkpoint, which sorts below "~".
  const prefix = requestKey(
    tenantId,
    EventReconciliationReceipt.FAMILY,
    eventId + ":" + domain + ":",
  );
  const rows = await ctx.db
    .query("materializationReceipts")
    .withIndex("by_receiptKey", (q) =>
      q.gte("receiptKey", prefix).lt("receiptKey", prefix + "~"),
    )
    .filter((q) => q.eq(q.field("tenantId"), tenantId))
    .collect();
  let newest: { createdAt: number; output: ReconciliationReceiptOutput } | null =
    null;
  for (const row of rows) {
    const output = row.output as ReconciliationReceiptOutput;
    if (!matchesEvent(output, event)) continue;
    if (!newest || row._creationTime >= newest.createdAt)
      newest = { createdAt: row._creationTime, output };
  }
  return newest?.output ?? null;
}

/** Still-open flags of one domain for one event. */
export async function openReconciliationFlags(
  ctx: QueryCtx,
  tenantId: string,
  eventId: string,
  event: EventFacts,
  domain: ReconciliationFlagDomain,
  rows: readonly FlaggableRow[],
): Promise<ReconciliationFlag[]> {
  const receipt = await receiptForEvent(ctx, tenantId, eventId, domain, event);
  if (!receipt || !Array.isArray(receipt.unresolved)) return [];
  const windows = receipt.inputVersions?.windows ?? [];

  const flags: ReconciliationFlag[] = [];
  for (const entry of receipt.unresolved) {
    for (const recordId of entry.recordIds) {
      const row = rows.find((candidate) => String(candidate._id) === recordId);
      const recorded = windows.find(
        (window) => window.key === domain + ":" + recordId,
      );
      if (
        !row ||
        row.deletedAt != null ||
        row.status === "voided" ||
        !recorded ||
        (row.version ?? null) !== recorded.startsAt
      )
        continue;
      const changeStarted = rows.some(
        (candidate) =>
          candidate.deletedAt == null &&
          String(candidate.replacesProposalId ?? "") === recordId,
      );
      if (domain === "proposal" && row.status === "accepted" && changeStarted)
        continue;
      flags.push({
        domain,
        code: entry.code,
        recordId,
        status: String(row.status ?? ""),
        ...(domain === "invoice" ? { canFollowPrice: canFollowPrice(row) } : {}),
      });
    }
  }
  return flags;
}
