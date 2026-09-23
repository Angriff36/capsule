/**
 * §8.2 packet reconciliation for headcount changes (AC-390 packet slice):
 * a later headcount change marks the issued packet revision out of date and
 * keeps the printed packet as history — this NEVER mutates an issued
 * historical packet revision (§14.1; rebuilding makes a NEW revision, never
 * a patch). One eventReconciliation receipt per input shape; a replay of the
 * same headcount writes no revision-row diff and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type PacketReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type PacketRow = Doc<"eventPacketRevisions">;

/** Identity + exactly-once receipting for the packet side of an Event
 * headcount change. Owns the receipt; it never writes packet revision rows. */
export class EventPacketReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * fan-outs — never writes packet revision rows itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: PacketReconcileTrigger,
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
      "packet",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither revision rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const revisions = (await ctx.db
      .query("eventPacketRevisions")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as PacketRow[];
    // This table carries no soft-delete column; the optional read keeps the
    // live filter honest without inventing a field.
    const live = revisions.filter(
      (row) => (row as { deletedAt?: number | null }).deletedAt == null,
    );
    // A current (not yet superseded) revision is now stale for the new
    // count — the issued revision itself stays untouched as history.
    const current = live.filter((row) => row.supersededBy == null);
    const unresolved = current.map((row) => ({
      code: "packet_stale",
      recordIds: [String(row._id)],
    }));
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["packet"],
      createdCount: 0,
      updatedCount: 0,
      retiredCount: 0,
      preservedCount: live.length,
      exceptionCount: 0,
      unresolved,
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventPacketReconciliation = new EventPacketReconciliation();
