/**
 * §8.2 rental reconciliation for Event.reschedule (AC-390 rental slice):
 * the command already moved the Event window — reserved equipment holds still
 * sitting on the old window move to the new start/end exactly once, while
 * checked-out / returned / cancelled holds stay on their original window as
 * custody history. This NEVER writes a status, custody, or identity field.
 * One eventReconciliation receipt per input shape; a replay of the same
 * schedule writes no row diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { availableEquipmentQuantity } from "./equipmentReservationAvailability";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type {
  ReconciliationReceiptOutput,
  TimingWindow,
} from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type RentalReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type ReservationRow = Doc<"equipmentReservations">;
type EventRow = Doc<"events">;

type Unresolved = { code: string; recordIds: string[] };

type ReconcileCounts = {
  updatedCount: number;
  preservedCount: number;
  unresolved: Unresolved[];
};

type ReconcileKeys = {
  windows: TimingWindow[];
  checkpoint: string;
  operationKey: string;
};

/** Same terminal list as venueReconciliation.ts: completed work stays
 * historical. */
const TERMINAL_STAGES = ["completed", "closed_out", "cancelled"];

/** Identity + exactly-once receipting for the rental side of an Event
 * reschedule. Owns the receipt; it never writes a custody field. */
export class EventRentalReconciliation {
  /** Runs in the originating Event command's transaction. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: RentalReconcileTrigger,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    if (TERMINAL_STAGES.includes(event.stage)) return;
    const startsAt = event.startsAt;
    const endsAt = event.endsAt;
    if (startsAt == null || endsAt == null) return;
    const keys = this.keysFor(event, String(eventId), startsAt, endsAt);
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      keys.operationKey,
    );
    if (prior) return;
    const outcome = await this.moveHolds(ctx, event, startsAt, endsAt);
    await this.recordReceipt(ctx, event, eventId, trigger, keys, outcome);
  }

  /** The event window makes a new date a NEW input shape while replaying the
   * same date is the SAME input shape. */
  private keysFor(
    event: EventRow,
    eventId: string,
    startsAt: number,
    endsAt: number,
  ): ReconcileKeys {
    const windows: TimingWindow[] = [
      { key: "event", startsAt, endsAt },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    return {
      windows,
      checkpoint,
      operationKey: eventReconciliationReceipt.operationKey(
        eventId,
        "rental",
        checkpoint,
      ),
    };
  }

  /** Moves every reserved hold that still sits on the old window; holds in a
   * performed or withdrawn state stay untouched as history. */
  private async moveHolds(
    ctx: MutationCtx,
    event: EventRow,
    startsAt: number,
    endsAt: number,
  ): Promise<ReconcileCounts> {
    const reservations = (await ctx.db
      .query("equipmentReservations")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()) as ReservationRow[];
    const counts: ReconcileCounts = {
      updatedCount: 0,
      preservedCount: 0,
      unresolved: [],
    };
    for (const row of reservations) {
      if (row.deletedAt != null) continue;
      if (
        row.status !== "reserved" ||
        (row.startsAt === startsAt && row.endsAt === endsAt)
      ) {
        counts.preservedCount++;
        continue;
      }
      if (await this.tryMove(ctx, event, row, startsAt, endsAt))
        counts.updatedCount++;
      else
        counts.unresolved.push({
          code: "rental_window_conflict",
          recordIds: [String(row._id)],
        });
    }
    return counts;
  }

  /** Moves one reserved hold onto the event window when the equipment lot can
   * still cover it there — excluding this hold so it cannot block itself. */
  private async tryMove(
    ctx: MutationCtx,
    event: EventRow,
    row: ReservationRow,
    startsAt: number,
    endsAt: number,
  ): Promise<boolean> {
    const equipment = await ctx.db.get(row.equipmentId);
    if (!equipment || equipment.deletedAt != null) return false;
    const others = (await ctx.db
      .query("equipmentReservations")
      .withIndex("by_equipmentId", (q) => q.eq("equipmentId", row.equipmentId))
      .collect()) as ReservationRow[];
    const available = availableEquipmentQuantity(
      equipment.quantity,
      others.filter((other) => other._id !== row._id),
      { tenantId: event.tenantId, startsAt, endsAt },
    );
    if (row.quantity > available) return false;
    // Window only: status, custody fields, and identity stay as they are.
    await ctx.db.patch(row._id, {
      startsAt,
      endsAt,
      updatedAt: Date.now(),
      version: row.version + 1,
    });
    return true;
  }

  /** Always after the work, and only after a readPrior miss. */
  private async recordReceipt(
    ctx: MutationCtx,
    event: EventRow,
    eventId: Id<"events">,
    trigger: RentalReconcileTrigger,
    keys: ReconcileKeys,
    outcome: ReconcileCounts,
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
        affectedDomains: ["rental"],
        createdCount: 0,
        updatedCount: outcome.updatedCount,
        retiredCount: 0,
        preservedCount: outcome.preservedCount,
        exceptionCount: 0,
        unresolved: outcome.unresolved,
        checkpoint: { state: "complete", key: keys.operationKey },
      } satisfies ReconciliationReceiptOutput,
    );
  }
}

export const eventRentalReconciliation = new EventRentalReconciliation();
