/**
 * §8.2 proposal reconciliation for headcount changes (AC-390 proposal
 * slice): a later headcount change records a `proposal/change requirement`
 * for each accepted proposal still sized for the old count and keeps the
 * signed document as history — this NEVER rewrites an accepted proposal
 * (§1.5 / §7.2; drafts are AC-388, not this slice). One eventReconciliation
 * receipt per input shape; a replay of the same headcount writes no
 * proposal-row diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type ProposalReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type ProposalRow = Doc<"proposals">;

/** Identity + exactly-once receipting for the proposal side of an Event
 * headcount change. Owns the receipt; it never writes proposal rows. */
export class EventProposalReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * fan-outs — never writes proposal rows itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: ProposalReconcileTrigger,
    headcount: { previousHeadcount: number; newHeadcount: number },
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const windows: TimingWindow[] = [
      { key: "headcount", startsAt: event.expectedHeadcount ?? null, endsAt: null },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "proposal",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither proposal rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const proposals = (await ctx.db
      .query("proposals")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as ProposalRow[];
    const liveProposals = proposals.filter((row) => row.deletedAt == null);
    // An accepted proposal still sized for the old count needs a person to
    // decide on a change — the signed document itself stays as history.
    const unresolved = liveProposals
      .filter(
        (row) =>
          row.status === "accepted" && row.guestCount !== headcount.newHeadcount,
      )
      .map((row) => ({
        code: "proposal_change_required",
        recordIds: [String(row._id)],
      }));
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["proposal"],
      createdCount: 0,
      updatedCount: 0,
      retiredCount: 0,
      preservedCount: liveProposals.length,
      exceptionCount: 0,
      unresolved,
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventProposalReconciliation = new EventProposalReconciliation();
