/**
 * §8.2 pack reconciliation for headcount changes (AC-390 pack slice): after
 * Manifest's PackListItem.syncContainerServings fan-out has scaled the
 * following pack lines, this records one eventReconciliation receipt per
 * input shape — and a replay of the same headcount writes no pack-item diff
 * and no second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type PackReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type PackInput = {
  previousHeadcount: number;
  newHeadcount: number;
};

type PackListRow = Doc<"packLists">;
type PackItemRow = Doc<"packListItems">;

/** A pack line follows its dish servings unless an operator override says it
 * does not. */
function isFollowing(row: PackItemRow): boolean {
  return row.followsDishServings !== false;
}

/** Identity + exactly-once receipting for the pack side of an Event headcount
 * change. Owns the receipt; the pack scaling itself stays in the declared
 * PackListItem.syncContainerServings reaction. */
export class EventPackReconciliation {
  /** Runs in the originating Event command's transaction, AFTER the declared
   * PackListItem.syncContainerServings reaction — never scales items itself. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger: PackReconcileTrigger,
    headcount: PackInput,
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
      "pack",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither pack rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const lists = (await ctx.db
      .query("packLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()) as PackListRow[];
    const liveLists = lists.filter((row) => row.deletedAt == null);
    const items: PackItemRow[] = [];
    for (const list of liveLists) {
      const rows = (await ctx.db
        .query("packListItems")
        .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
        .collect()) as PackItemRow[];
      items.push(...rows.filter((row) => row.deletedAt == null));
    }
    const updatedCount = items.filter(
      (row) => isFollowing(row) && row.containerServings === headcount.newHeadcount,
    ).length;
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger.triggerEventId,
      triggerType: trigger.triggerType,
      inputVersions: { checkpoint, windows },
      affectedDomains: ["pack"],
      createdCount: 0,
      updatedCount,
      retiredCount: 0,
      preservedCount: items.length - updatedCount,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventPackReconciliation = new EventPackReconciliation();
