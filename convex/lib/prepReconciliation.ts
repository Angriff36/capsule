/**
 * §8.2 prep reconciliation for headcount changes (AC-390 prep slice): after
 * Manifest's EventDish.syncHeadcount fan-out has re-scaled the live prepTasks
 * (following dishes scale, overrides stay), this records one
 * eventReconciliation receipt per input shape — and a replay of the same
 * headcount writes no prep-quantity diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type PrepReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type PrepInput = {
  previousHeadcount: number;
  newHeadcount: number;
};

type PrepTaskRow = Doc<"prepTasks">;

/** Identity + exactly-once receipting for the prep side of an Event headcount
 * change. Owns the receipt; the prep scaling itself stays in the declared
 * EventDish.syncHeadcount reaction (overrides keep their quantity). */
export class EventPrepReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * prep-sync fan-outs — never writes prep tasks itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: PrepReconcileTrigger,
    headcount: PrepInput,
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
      "prep",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither prep rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const tasks = (await ctx.db
      .query("prepTasks")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as PrepTaskRow[];
    const liveTasks = tasks.filter((row) => row.deletedAt == null);
    const updatedCount = liveTasks.filter(
      (row) => row.quantity === headcount.newHeadcount,
    ).length;
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["prep"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: liveTasks.length - updatedCount,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventPrepReconciliation = new EventPrepReconciliation();
