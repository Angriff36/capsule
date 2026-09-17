import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { eventTimingWindows, matchesTimingMilestone } from "../../src/lib/eventTimingMilestones";

type TimingEvent = Doc<"events"> & {
  timingCanRecalculate: boolean;
  timingSuggestedSetupMinutes: number | null;
  timingOnsiteAt: number | null;
  timingDepartShopAt: number | null;
  timingStaffOnAt: number | null;
  timingDepartVenueAt: number | null;
  timingReturnShopAt: number | null;
  timingStaffOffAt: number | null;
};
export type EventTimingPlan = {
  event: TimingEvent;
  nextSortOrder: number;
  milestones: (ReturnType<typeof eventTimingWindows>[number] & {
    row: Doc<"eventTimelineActivities"> | null;
    matches: Doc<"eventTimelineActivities">[];
    removed: boolean;
    performed: boolean;
    manual: boolean;
  })[];
};

/** Shared read plan; generated Event computeds provide every calculated time. */
export async function readEventTimingPlan(ctx: QueryCtx, eventId: Id<"events">): Promise<EventTimingPlan> {
  const event: TimingEvent | null = await ctx.runQuery(api.queries.getEvent, { id: eventId });
  if (!event) throw new Error("Event not found");
  const rows = (await ctx.db.query("eventTimelineActivities")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect())
    .filter((row) => row.tenantId === event.tenantId && row.scheduledAt != null);
  const milestones = eventTimingWindows(event).map((window) => {
    const linked = rows.filter((row) => row.deletedAt == null && row.timingMilestone === window.key);
    const matches = linked.length ? linked : rows.filter((row) => row.deletedAt == null &&
      row.timingMilestone == null && matchesTimingMilestone(row, window));
    const row = matches.length === 1 ? matches[0] : null;
    const removed = !matches.length && rows.some((candidate) => candidate.deletedAt != null &&
      (candidate.timingMilestone === window.key || matchesTimingMilestone(candidate, window)));
    const performed = row?.completedAt != null || row?.timingPerformedAt != null;
    const manual = row?.timingManuallyAdjustedAt != null ||
      (row != null && row.timingMilestone == null && (row.startsAt != null || row.endsAt != null));
    return { ...window, row, matches, removed, performed, manual };
  });
  const nextSortOrder = rows.filter((row) => row.deletedAt == null).reduce(
    (max, row) => Math.max(max, row.sortOrder ?? 0), -1,
  ) + 1;
  return { event, milestones, nextSortOrder };
}

/** Runs in the originating Event command's transaction, including reschedules. */
export async function reconcileEventTiming(ctx: MutationCtx, eventId: Id<"events">) {
  const { event, milestones, nextSortOrder } = await readEventTimingPlan(ctx, eventId);
  if (event.timingConfiguredAt == null) return;
  let nextOrder = nextSortOrder;
  for (const milestone of milestones) {
    if (milestone.removed || milestone.matches.length > 1) continue;
    let row = milestone.row;
    if (!row) {
      // Start untimed so the planning command can distinguish a fresh generated
      // block from an operator's pre-existing time. Both writes are atomic.
      const created: { docId: Id<"eventTimelineActivities"> } = await ctx.runMutation(
        api.mutations.EventTimelineActivity_createViaSchedule,
        { eventId, name: milestone.name, category: milestone.category,
          assigneeTeams: ["Everyone"], sortOrder: nextOrder++,
          idempotencyKey: `event-timing:${eventId}:${milestone.key}` },
      );
      row = await ctx.db.get(created.docId);
    }
    if (!row) throw new Error("Timeline block was not created");
    if (row.timingMilestone === milestone.key &&
      (milestone.performed || milestone.manual ||
        ((row.startsAt ?? null) === milestone.startsAt && (row.endsAt ?? null) === milestone.endsAt))) continue;
    await ctx.runMutation(api.mutations.EventTimelineActivity_planTiming, {
      docId: row._id, version: row.version, milestone: milestone.key,
      startsAt: milestone.startsAt ?? undefined, endsAt: milestone.endsAt ?? undefined,
    });
  }
}
