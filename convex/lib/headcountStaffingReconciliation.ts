/**
 * §8.2 staffing reconciliation for headcount changes (AC-390 staffing
 * slice): staffing does NOT scale with guest count — live eventStaffNeeds keep
 * their role, status, and window. This records one eventReconciliation
 * receipt per input shape, and a replay of the same headcount writes no
 * staff-need diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type StaffingReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type StaffNeedRow = Doc<"eventStaffNeeds">;

/** Identity + exactly-once receipting for the staffing side of an Event
 * headcount change. Owns the receipt; it never writes staff needs —
 * headcount does not move staffing. */
export class EventHeadcountStaffingReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * fan-outs — never writes staff-need rows itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: StaffingReconcileTrigger,
    _headcount: { previousHeadcount: number; newHeadcount: number },
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
      "staffing",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither staff-need rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const needs = (await ctx.db
      .query("eventStaffNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as StaffNeedRow[];
    const liveNeeds = needs.filter((row) => row.deletedAt == null);
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["staffing"],
      createdCount: 0,
      updatedCount: 0,
      retiredCount: 0,
      preservedCount: liveNeeds.length,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventHeadcountStaffingReconciliation =
  new EventHeadcountStaffingReconciliation();
