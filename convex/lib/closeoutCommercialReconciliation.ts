/**
 * §8.2 closeout reconciliation for Event.correctCommercial (AC-388 closeout
 * slice): closing an event seeds one draft EventCloseout with zero actuals and
 * the budget taken from the event (event-closeout.manifest EventClosedOut
 * cascade). When the budget is corrected after closeOut, a draft still in that
 * zero-actual shape follows the corrected budget through the governed
 * EventCloseout.followEventCommercial command. A draft finance already
 * captured keeps its numbers and is flagged `closeout_review`; a finalized
 * closeout is history (AC-407) and is flagged `closeout_change_required`.
 *
 * Following runs as the tenant system role: sales managers may correct the
 * commercial seed, while closeouts are finance / event-manager gated.
 *
 * Only closeouts whose budget differs from the corrected one are in scope.
 * Their id + version are part of the input shape and the prior receipt is
 * checked BEFORE any write, so replaying the same correction after the draft
 * followed is a no-op (nothing differs), and replaying it against an unchanged
 * flagged closeout finds the prior receipt and writes nothing.
 */
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type CloseoutReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type CloseoutRow = Doc<"eventCloseouts">;
type CommercialCorrection = { budgetedRevenue: number; budgetedCost: number };

/** True for a draft nobody has captured since the closeOut cascade made it. */
function followsEventCommercial(row: CloseoutRow): boolean {
  return (
    row.status === "draft" &&
    Number(row.actualRevenue) === 0 &&
    Number(row.totalActualCost) === 0 &&
    Number(row.actualHeadcount) === 0
  );
}

/** Identity + exactly-once receipting for the closeout side of an Event
 * commercial correction. Writes closeouts only through
 * EventCloseout.followEventCommercial. */
export class EventCloseoutCommercialReconciliation {
  /** Runs in the originating Event command's transaction. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: CloseoutReconcileTrigger,
    correction: CommercialCorrection,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    const closeouts = (await ctx.db
      .query("eventCloseouts")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as CloseoutRow[];
    const differing = closeouts.filter(
      (row) =>
        row.tenantId === event.tenantId &&
        row.deletedAt == null &&
        (Number(row.budgetedRevenue) !== correction.budgetedRevenue ||
          Number(row.budgetedCost) !== correction.budgetedCost),
    );
    if (differing.length === 0) return;
    const windows: TimingWindow[] = [
      { key: "stage:" + event.stage, startsAt: null, endsAt: null },
      { key: "budgetedRevenue", startsAt: correction.budgetedRevenue, endsAt: null },
      { key: "budgetedCost", startsAt: correction.budgetedCost, endsAt: null },
      ...differing.map((row) => ({
        key: "closeout:" + String(row._id),
        startsAt: row.version,
        endsAt: null,
      })),
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "closeout",
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
    const system = TenantSystemCommandRunner.forTenant(ctx, event.tenantId).context;
    for (const row of differing) {
      if (followsEventCommercial(row)) {
        await system.runMutation(api.mutations.EventCloseout_followEventCommercial, {
          docId: row._id,
          version: row.version,
          budgetedRevenue: correction.budgetedRevenue,
          budgetedCost: correction.budgetedCost,
        });
        updatedCount += 1;
        continue;
      }
      unresolved.push({
        code: row.status === "draft" ? "closeout_review" : "closeout_change_required",
        recordIds: [String(row._id)],
      });
    }
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["closeout"],
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

export const eventCloseoutCommercialReconciliation = new EventCloseoutCommercialReconciliation();
