/**
 * §8.2 staffing reconciliation (AC-390 first slice): after timing reconciles
 * on an Event change, staffing runs once through the same receipt pattern —
 * one receipt per input shape, and replaying the same schedule against
 * unchanged input writes neither staffing rows nor a second receipt.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventStaffing } from "./eventStaffingOperations";
import { readEventTimingPlan } from "./eventTimingOperations";
import { eventReconciliationReceipt } from "./reconciliationReceipt";
import type { ReconciliationReceiptOutput, TimingWindow } from "./reconciliationReceipt";

/** Which ledger command triggered this reconcile — recorded on the receipt. */
export type StaffingReconcileTrigger = {
  triggerEventId: string;
  triggerType: string;
};

type SnapshotRow = {
  id: string;
  startsAt: number | null;
  endsAt: number | null;
  status: string | null;
};

const LIVE_TABLES = [
  "eventStaffNeeds",
  "eventAssignments",
  "shifts",
] as const;

type LiveTable = (typeof LIVE_TABLES)[number];

async function snapshotLiveStaffing(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<SnapshotRow[]> {
  const rows: SnapshotRow[] = [];
  for (const table of LIVE_TABLES as readonly LiveTable[]) {
    const tableRows = await ctx.db
      .query(table)
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    for (const row of tableRows as (Doc<LiveTable> & {
      deletedAt?: number | null;
      startsAt?: number | null;
      endsAt?: number | null;
      status?: string | null;
    })[]) {
      if (row.deletedAt != null) continue;
      rows.push({
        id: row._id,
        startsAt: row.startsAt ?? null,
        endsAt: row.endsAt ?? null,
        status: row.status ?? null,
      });
    }
  }
  return rows.sort((a, b) => a.id.localeCompare(b.id));
}

/** Drift between the live staffing rows before and after the reconcile. */
function countChanges(before: SnapshotRow[], after: SnapshotRow[]) {
  const beforeById = new Map(before.map((row) => [row.id, row]));
  let createdCount = 0;
  let updatedCount = 0;
  let retiredCount = 0;
  let preservedCount = 0;
  for (const row of after) {
    const prior = beforeById.get(row.id);
    if (!prior) {
      createdCount++;
      continue;
    }
    if (
      prior.startsAt === row.startsAt &&
      prior.endsAt === row.endsAt &&
      prior.status === row.status
    ) {
      preservedCount++;
    } else {
      updatedCount++;
    }
  }
  for (const row of before) {
    const next = after.find((candidate) => candidate.id === row.id);
    if (!next || (row.status !== "cancelled" && next.status === "cancelled"))
      retiredCount++;
  }
  return { createdCount, updatedCount, retiredCount, preservedCount };
}

/** Identity + exactly-once wrapper for the staffing side of an Event
 * reconciliation. Owns the receipt; the staffing work itself stays in
 * eventStaffingOperations. */
export class EventStaffingReconciliation {
  /** Runs in the originating Event command's transaction, after timing. */
  async run(
    ctx: MutationCtx,
    eventId: Id<"events">,
    trigger?: StaffingReconcileTrigger,
  ): Promise<void> {
    const event = await ctx.db.get(eventId);
    if (!event) return;
    const plan = await readEventTimingPlan(ctx, eventId);
    const milestone = (key: string) =>
      plan.milestones.find((row) => row.key === key);
    const on = milestone("staff_on");
    const off = milestone("staff_off");
    const windows: TimingWindow[] = [
      {
        key: "event",
        startsAt: event.startsAt ?? null,
        endsAt: event.endsAt ?? null,
      },
      { key: "staff_on", startsAt: on?.startsAt ?? null, endsAt: on?.endsAt ?? null },
      { key: "staff_off", startsAt: off?.startsAt ?? null, endsAt: off?.endsAt ?? null },
      { key: `stage:${event.stage}`, startsAt: null, endsAt: null },
    ];
    const checkpoint = eventReconciliationReceipt.windowsCheckpoint(windows);
    const operationKey = eventReconciliationReceipt.operationKey(
      String(eventId),
      "staffing",
      checkpoint,
    );
    // §8.2 replay no-op: this exact input shape already reconciled; a second
    // run must write neither staffing rows nor another receipt.
    const prior = await eventReconciliationReceipt.readPrior(
      ctx,
      event.tenantId,
      operationKey,
    );
    if (prior) return;
    const before = await snapshotLiveStaffing(ctx, eventId);
    await reconcileEventStaffing(ctx, eventId);
    const after = await snapshotLiveStaffing(ctx, eventId);
    const counts = countChanges(before, after);
    await eventReconciliationReceipt.persist(ctx, event.tenantId, operationKey, {
      eventId: String(eventId),
      tenantId: event.tenantId,
      triggerEventId: trigger?.triggerEventId ?? String(eventId),
      triggerType: trigger?.triggerType ?? "reconcileEventStaffing",
      inputVersions: { checkpoint, windows },
      affectedDomains: ["staffing"],
      ...counts,
      exceptionCount: 0,
      unresolved: [],
      checkpoint: { state: "complete", key: operationKey },
    } satisfies ReconciliationReceiptOutput);
  }
}

export const eventStaffingReconciliation = new EventStaffingReconciliation();
