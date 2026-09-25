/**
 * §8.2 demand reconciliation for headcount changes (AC-390 demand slice):
 * after Manifest's EventIngredientContribution.revise fan-out has re-synced
 * the live IngredientDemands, this records one eventReconciliation receipt
 * per input shape — and a replay of the same headcount writes no
 * demand-quantity diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type DemandReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type DemandInput = {
  previousHeadcount: number;
  newHeadcount: number;
};

type DemandRow = Doc<"ingredientDemands">;

/** Identity + exactly-once receipting for the demand side of an Event
 * headcount change. Owns the receipt; the demand scaling itself stays in the
 * declared EventIngredientContribution.revise / syncFromContributions
 * reactions. */
export class EventDemandReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * demand-sync reactions — never writes demands itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: DemandReconcileTrigger,
    headcount: DemandInput,
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
      "demand",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither demand rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const demands = (await ctx.db
      .query("ingredientDemands")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as DemandRow[];
    const liveDemands = demands.filter((row) => row.deletedAt == null);
    const updatedCount = liveDemands.filter(
      (row) => row.requiredQuantity === headcount.newHeadcount,
    ).length;
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["demand"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: liveDemands.length - updatedCount,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventDemandReconciliation = new EventDemandReconciliation();
