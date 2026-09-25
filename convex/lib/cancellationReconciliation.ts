/**
 * §8.2 cancellation reconciliation for Event.cancel (AC-390 cancellation
 * slice): cancelling the event stands down unfinished equipment holds and
 * unfinished crew assignments exactly once, while holds already checked out
 * and crew already checked in stay as history. One eventReconciliation
 * receipt for the `cancellation` domain per input shape; a replay of the
 * same cancelled event writes no diff and no second receipt. EventCancelled
 * fires AFTER the Event is already `cancelled`, so — unlike the rental and
 * venue reconcilers — this class must NOT skip the cancelled stage.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  standDownEventAssignments,
  standDownEventEquipmentReservations,
  standDownEventLogisticsAndBilling,
} from "./eventCancellation";
import { reconcileEventTiming } from "./eventTimingOperations";
import { eventReconciliationIsolation } from "./reconciliationIsolation";
import { releaseEventInventoryHolds } from "./inventoryEvents";
import { standDownEventPrep } from "./prepRecipeEvents";
import { standDownEventPurchasing } from "./purchasingEvents";
import { reconcileEventStaffing } from "./eventStaffingOperations";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type {
  ReconciliationReceiptOutput,
  TimingWindow,
} from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type CancellationReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type EventRow = Doc<"events">;
type ReservationRow = Doc<"equipmentReservations">;
type AssignmentRow = Doc<"eventAssignments">;

type ReconcileCounts = {
  updatedCount: number;
  preservedCount: number;
};

type ReconcileKeys = {
  windows: TimingWindow[];
  checkpoint: string;
  operationKey: string;
};

/** Identity + exactly-once receipting for the stand-down side of an Event
 * cancel. Owns the receipt; the stand-down helpers write the rows. */
export class EventCancellationReconciliation {
  /** Runs in the originating Event command's transaction. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: CancellationReconcileTrigger,
    reason: string,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    // The stand-down helpers throw unless the Event is already cancelled, so
    // `cancelled` is the only stage this reconcile can ever run against.
    if (event.stage !== "cancelled") return;
    const keys = this.keysFor(event, String(eventId));
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      keys.operationKey,
    );
    if (prior) return;
    const counts = await this.countWork(ctx, event);
    await this.standDown(ctx, eventId, event.tenantId, trigger, reason);
    await this.recordReceipt(ctx, event, eventId, trigger, keys, counts);
  }

  /** The cancelled event with its window makes the input shape; replaying the
   * same cancelled event is the SAME input shape. */
  private keysFor(event: EventRow, eventId: string): ReconcileKeys {
    const windows: TimingWindow[] = [
      {
        key: "event",
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
      },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    return {
      windows,
      checkpoint,
      operationKey: eventReconciliationReceipt.operationKey(
        eventId,
        "cancellation",
        checkpoint,
      ),
    };
  }

  /** Counts, BEFORE the stand-down, the live holds and assignments the cancel
   * will stand down versus the performed history it will preserve. */
  private async countWork(
    ctx: MutationCtx,
    event: EventRow,
  ): Promise<ReconcileCounts> {
    const counts: ReconcileCounts = { updatedCount: 0, preservedCount: 0 };
    const reservations = (await ctx.db
      .query("equipmentReservations")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()) as ReservationRow[];
    for (const row of reservations) {
      if (row.deletedAt != null) continue;
      if (row.status === "reserved") counts.updatedCount++;
      else counts.preservedCount++;
    }
    const assignments = (await ctx.db
      .query("eventAssignments")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()) as AssignmentRow[];
    for (const row of assignments) {
      if (row.deletedAt != null) continue;
      if (row.status === "assigned" || row.status === "confirmed")
        counts.updatedCount++;
      else counts.preservedCount++;
    }
    return counts;
  }

  /** The existing stand-down sequence, in the EventCancelled order. */
  private async standDown(
    ctx: MutationCtx,
    eventId: Id<"events">,
    tenantId: string,
    trigger: CancellationReconcileTrigger,
    reason: string,
  ): Promise<void> {
    await reconcileEventStaffing(ctx, eventId);
    await releaseEventInventoryHolds(ctx, eventId);
    await standDownEventLogisticsAndBilling(ctx, eventId);
    await standDownEventEquipmentReservations(ctx, eventId);
    await standDownEventAssignments(ctx, eventId);
    // AC-424: timing refuses a cancelled parent, so a bare throw here would
    // abort the cascade before purchasing stands down. Isolate.
    await eventReconciliationIsolation.run(ctx, {
      eventId: String(eventId),
      tenantId,
      trigger,
      domains: [
        { name: "timing", run: () => reconcileEventTiming(ctx, eventId, trigger) },
        // A purchasing failure must fail the cancel: a cancelled event with
        // live purchase needs would keep the buyer shopping for it.
        {
          name: "purchasing",
          run: () => standDownEventPurchasing(ctx, eventId),
          mustSucceed: true,
        },
      ],
    });
    await standDownEventPrep(ctx, { eventId }, reason);
  }

  /** Always after the work, and only after a readPrior miss. */
  private async recordReceipt(
    ctx: MutationCtx,
    event: EventRow,
    eventId: Id<"events">,
    trigger: CancellationReconcileTrigger,
    keys: ReconcileKeys,
    counts: ReconcileCounts,
  ): Promise<void> {
    await eventReconciliationReceipt.persist(
      ctx,
      event.tenantId,
      keys.operationKey,
      {
        eventId: String(eventId),
        tenantId: event.tenantId,
        triggerEventId: trigger.triggerEventId,
        triggerType: trigger.triggerType,
        inputVersions: { checkpoint: keys.checkpoint, windows: keys.windows },
        affectedDomains: ["cancellation"],
        createdCount: 0,
        updatedCount: counts.updatedCount,
        retiredCount: 0,
        preservedCount: counts.preservedCount,
        exceptionCount: 0,
        unresolved: [],
        checkpoint: { state: "complete", key: keys.operationKey },
      } satisfies ReconciliationReceiptOutput,
    );
  }
}

export const eventCancellationReconciliation =
  new EventCancellationReconciliation();
