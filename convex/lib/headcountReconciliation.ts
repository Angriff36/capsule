/**
 * §8.2 menu reconciliation for headcount changes (AC-390 next slice): after
 * Manifest's EventDish.syncHeadcount fan-out has scaled the following dishes,
 * this records one eventReconciliation receipt per input shape — and a replay
 * of the same headcount writes no dish diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type HeadcountReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type HeadcountInput = {
  previousHeadcount: number;
  newHeadcount: number;
};

type DishRow = Doc<"eventDishes">;

/** Live = neither soft-deleted nor removed from the event menu. */
function isLive(row: DishRow): boolean {
  return row.deletedAt == null && row.removedAt == null;
}

/** A dish follows the event headcount unless an operator override says it
 * does not (override 0 is "revoke", not a real override). */
function isFollowing(row: DishRow): boolean {
  return (
    row.followsEventHeadcount !== false &&
    (row.headcountOverride == null || row.headcountOverride === 0)
  );
}

/** Identity + exactly-once receipting for the menu side of an Event
 * headcount change. Owns the receipt; the dish scaling itself stays in the
 * declared EventDish.syncHeadcount reaction. */
export class EventHeadcountReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * EventDish.syncHeadcount reaction — never scales dishes itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: HeadcountReconcileTrigger,
    headcount: HeadcountInput,
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
      "menu",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither dish rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const rows = (await ctx.db
      .query("eventDishes")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as DishRow[];
    const live = rows.filter(isLive);
    const updatedCount = live.filter(
      (row) => isFollowing(row) && row.quantityServings === headcount.newHeadcount,
    ).length;
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["menu"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: live.length - updatedCount,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventHeadcountReconciliation = new EventHeadcountReconciliation();
