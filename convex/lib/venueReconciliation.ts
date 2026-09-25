/**
 * §8.2 venue reconciliation for Event.changeVenue (AC-390 venue slice):
 * the command already wrote the venue snapshot onto the Event — this records
 * ONE venue receipt and flags the current issued packet revision out of date
 * WITHOUT mutating it (§14.1 / §20.1 test 15 packet-staleness: the issued
 * print stays history). This NEVER writes Event/proposal/packet/route/
 * purchasing rows. One eventReconciliation receipt per input shape; a replay
 * of the same venue writes no row diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type VenueReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

/** The venue snapshot Event.changeVenue already wrote onto the Event. */
export type VenueInput = {
  venueId: string | null;
  venueName: string | null;
  venueAddress: string | null;
  venueCapacity: number | null;
};

type PacketRow = Doc<"eventPacketRevisions">;

/** Same terminal list as recipeReconciliation.ts: completed work stays
 * historical. */
const TERMINAL_STAGES = ["completed", "closed_out", "cancelled"];

/** Identity + exactly-once receipting for the venue side of an Event venue
 * change. Owns the receipt; it never writes packet revision rows. */
export class EventVenueReconciliation {
  /** Runs in the originating Event command's transaction. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: VenueReconcileTrigger,
    input: VenueInput,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event || event.deletedAt != null) return;
    if (TERMINAL_STAGES.includes(event.stage)) return;
    // The venue key makes Garden Hall → Lakeside Pavilion a NEW input shape
    // while replaying Lakeside Pavilion is the SAME input shape.
    const windows: TimingWindow[] = [
      { key: "headcount", startsAt: event.expectedHeadcount ?? null, endsAt: null },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
      {
        key: `venue:${input.venueId ?? ""}:${input.venueName ?? ""}:${input.venueAddress ?? ""}:${input.venueCapacity ?? ""}`,
        startsAt: null,
        endsAt: null,
      },
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "venue",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    await this.flagStalePacket(ctx, event.tenantId, eventId, trigger, input, {
      checkpoint,
      windows,
      operationKey,
    });
  }

  /** Records the venue receipt: the issued packet revision is flagged stale
   * (as receipt `unresolved` only) and stays untouched as history (§14.1). */
  private async flagStalePacket(
    ctx: MutationCtx,
    tenantId: string,
    eventId: Id<"events">,
    trigger: VenueReconcileTrigger,
    input: VenueInput,
    keys: {
      checkpoint: string;
      windows: TimingWindow[];
      operationKey: string;
    },
  ): Promise<void> {
    const revisions = (await ctx.db
      .query("eventPacketRevisions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as PacketRow[];
    // This table carries no soft-delete column; the optional read keeps the
    // live filter honest without inventing a field.
    const live = revisions.filter(
      (row) => (row as { deletedAt?: number | null }).deletedAt == null,
    );
    // A current (not yet superseded) revision is now stale for the new venue
    // — the issued revision itself stays untouched as history.
    const current = live.filter((row) => row.supersededBy == null);
    const unresolved = current.map((row) => ({
      code: "packet_stale",
      recordIds: [String(row._id)],
    }));
    await eventReconciliationReceipt.persist(ctx, tenantId, keys.operationKey, {
      eventId: String(eventId),
      tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint: keys.checkpoint, windows: keys.windows },
      affectedDomains: ["venue"],
      // The venue snapshot was already written by Event.changeVenue itself.
      createdCount: 0,
      updatedCount: 1,
      retiredCount: 0,
      preservedCount: live.length,
      exceptionCount: 0,
      unresolved,
      checkpoint: { state: "complete", key: keys.operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventVenueReconciliation = new EventVenueReconciliation();
