/**
 * §8.2 proposal reconciliation for headcount changes. A later headcount
 * change records a `proposal/change requirement` for each sent, viewed or
 * accepted proposal still sized for the old count and keeps the document as
 * history — this NEVER rewrites a proposal the client has seen (§1.5 / §7.2;
 * AC-390 slice).
 *
 * AC-388 proposal draft slice: an unsent draft linked to the event that is
 * still sized for the OLD event count follows the new count through the
 * governed Proposal.followEventHeadcount command, priced by the central calc
 * (src/lib/pricing.ts). A draft a person sized differently is their override:
 * it keeps its count and is flagged `proposal_review` until they set it back
 * to the event count. Following runs as the tenant system role — it is part
 * of the headcount change the caller was already allowed to make, while
 * proposals are sales-gated (event staff may change headcount).
 *
 * Only open proposals whose guest count differs from the new count are in
 * scope. Their id + version are part of the input shape and the prior receipt
 * is checked BEFORE any write, so replaying the same headcount after the
 * drafts followed is a no-op (nothing differs), replaying it against unchanged
 * flagged proposals finds the prior receipt and writes nothing, and a
 * proposal added or changed since then gets a fresh receipt with its flag.
 */
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type ProposalReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type ProposalRow = Doc<"proposals">;
type HeadcountChange = { previousHeadcount: number; newHeadcount: number };

/** Statuses a headcount change can still matter to; declined, expired and
 * superseded proposals are closed history. */
const OPEN_STATUSES = new Set(["draft", "sent", "viewed", "accepted"]);

/** True for an unsent draft still sized for the event's old count. */
function followsEventHeadcount(row: ProposalRow, headcount: HeadcountChange): boolean {
  return (
    row.status === "draft" &&
    row.draftedAt != null &&
    row.replacesProposalId == null &&
    row.guestCount === headcount.previousHeadcount &&
    row.guestCount !== headcount.newHeadcount
  );
}

/** Identity + exactly-once receipting for the proposal side of an Event
 * headcount change. Writes proposals only through the governed
 * Proposal.followEventHeadcount command (and the central line restamp). */
export class EventProposalReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * fan-outs. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: ProposalReconcileTrigger,
    headcount: HeadcountChange,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const proposals = (await ctx.db
      .query("proposals")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as ProposalRow[];
    const differing = proposals.filter(
      (row) =>
        row.deletedAt == null &&
        row.tenantId === event.tenantId &&
        OPEN_STATUSES.has(row.status) &&
        row.guestCount !== headcount.newHeadcount,
    );
    if (differing.length === 0) return;

    const windows: TimingWindow[] = [
      { key: "headcount", startsAt: headcount.newHeadcount, endsAt: null },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
      ...differing.map((row) => ({
        key: `proposal:${String(row._id)}`,
        startsAt: row.version ?? null,
        endsAt: null,
      })),
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "proposal",
      checkpoint,
    );
    // §8.2 replay no-op, checked before any write: this exact input shape
    // already reconciled; a second run must not write or receipt again.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;

    let updatedCount = 0;
    const unresolved: ReconciliationReceiptOutput["unresolved"] = [];
    for (const row of differing) {
      if (
        followsEventHeadcount(row, headcount) &&
        (await this.followDraft(ctx, event.tenantId, row, headcount.newHeadcount))
      ) {
        updatedCount += 1;
        continue;
      }
      // A draft a person sized differently keeps their count; a proposal the
      // client has seen (sent, viewed, accepted) stays as history and needs a
      // person to decide on a change.
      unresolved.push({
        code: row.status === "draft" ? "proposal_review" : "proposal_change_required",
        recordIds: [String(row._id)],
      });
    }
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["proposal"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: unresolved.length,
      exceptionCount: 0,
      unresolved,
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }

  /** Moves one untouched draft to the new count, priced by the central calc.
   * A draft with no priced lines keeps its typed money. Returns false (the
   * draft stays and is flagged) when the new price would go below zero. */
  private async followDraft(
    ctx: MutationCtx,
    tenantId: string,
    row: ProposalRow,
    guestCount: number,
  ): Promise<boolean> {
    const lines = (
      await ctx.db
        .query("proposalLineItems")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", row._id))
        .collect()
    ).filter((line) => line.deletedAt == null);
    let subtotal = Number(row.subtotal) || 0;
    let total = Number(row.total) || 0;
    if (lines.length > 0) {
      const priced = computeProposalPricing({
        lines: lines.map((line) => ({
          pricingBasis: line.pricingBasis as PricingBasis,
          unitPrice: Number(line.unitPrice) || 0,
          quantity: Number(line.quantity) || 0,
        })),
        guestCount,
        discountAmount: Number(row.discountAmount) || 0,
        taxAmount: Number(row.taxAmount) || 0,
      });
      if (priced.total < 0) return false;
      subtotal = priced.subtotal;
      total = priced.total;
    }
    const sales = TenantSystemCommandRunner.forTenant(ctx, tenantId).context;
    await sales.runMutation(api.mutations.Proposal_followEventHeadcount, {
      docId: row._id,
      version: row.version,
      guestCount,
      subtotal,
      total,
    });
    // Per-guest line amounts restamp through the same central calc the
    // line editors use; the totals it writes equal the ones above.
    if (lines.length > 0)
      await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
        proposalId: row._id,
      });
    return true;
  }
}

export const eventProposalReconciliation = new EventProposalReconciliation();
