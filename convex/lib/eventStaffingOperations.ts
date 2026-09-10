import { ConvexError } from "convex/values";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthContext } from "./authContext";
import { readEventTimingPlan } from "./eventTimingOperations";

type StaffingSource = {
  id: string;
  personId: Id<"people"> | null;
  role: string;
  startsAt: number | null;
  endsAt: number | null;
  followsEventTiming: boolean;
  performed: boolean;
};
type StaffingInterval = {
  startsAt: number;
  endsAt: number;
  sources: StaffingSource[];
};
const time = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const sameTime = (left: number | null | undefined, right: number | null) =>
  (left ?? null) === right;
const followsTiming = (row: {
  followsEventTiming?: boolean | null;
  startsAt?: number | null;
  endsAt?: number | null;
}) => row.followsEventTiming ?? (row.startsAt == null && row.endsAt == null);
const sourceIds = (sources: readonly StaffingSource[]) =>
  sources.map((source) => source.id).sort();
const sourceRoles = (sources: readonly StaffingSource[]) =>
  [...new Set([...sources].sort((a, b) => a.id.localeCompare(b.id)).map((source) => source.role))].join(" / ");
const sameIds = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

async function readStaffingRows(ctx: MutationCtx, eventId: Id<"events">, tenantId: string) {
  const [assignments, needs, shifts, records] = await Promise.all([
    ctx.db.query("eventAssignments").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("eventStaffNeeds").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("shifts").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
    ctx.db.query("timeRecords").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).collect(),
  ]);
  const local = <T extends { tenantId: string; deletedAt?: number | null }>(rows: T[]) =>
    rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);
  const localShifts = local(shifts);
  const workRecords = new Map(local(records).map((row) => [row._id, row]));
  // A clock-in may carry only shiftId. Its actual work is still authoritative
  // even when the optional eventId was never copied onto the TimeRecord.
  for (const shift of localShifts) {
    const linked = await ctx.db.query("timeRecords")
      .withIndex("by_shiftId", (q) => q.eq("shiftId", shift._id)).collect();
    for (const record of local(linked)) workRecords.set(record._id, record);
  }
  return { assignments: local(assignments), needs: local(needs), shifts: localShifts, records: [...workRecords.values()] };
}

function storedStaffingSources(rows: Awaited<ReturnType<typeof readStaffingRows>>): StaffingSource[] {
  return [
    ...rows.assignments.filter((row) => row.status !== "unassigned").map((row) => ({
      id: row._id, personId: row.personId, role: row.role,
      startsAt: time(row.startsAt), endsAt: time(row.endsAt), followsEventTiming: followsTiming(row),
      performed: row.checkedInAt != null || row.checkedOutAt != null || row.noShowAt != null,
    })),
    ...rows.needs.filter((row) => row.status === "filled" && row.filledByPersonId).map((row) => ({
      id: row._id, personId: row.filledByPersonId!, role: row.role,
      startsAt: time(row.startsAt), endsAt: time(row.endsAt), followsEventTiming: followsTiming(row), performed: false,
    })),
  ];
}

async function readCrewWindow(ctx: MutationCtx, eventId: Id<"events">) {
  const timing = await readEventTimingPlan(ctx, eventId);
  const crewTime = (key: "staff_on" | "staff_off") => {
    const milestone = timing.milestones.find((row) => row.key === key)!;
    if (milestone.removed || milestone.matches.length > 1) return null;
    return time(milestone.row && (milestone.manual || milestone.performed)
      ? milestone.row.startsAt : milestone.startsAt);
  };
  return { startsAt: crewTime("staff_on"), endsAt: crewTime("staff_off") };
}

function shiftPreservesWork(shift: Doc<"shifts">, workedShiftIds: Set<string>) {
  return shift.eventStaffingManagedAt == null || shift.status !== "scheduled" ||
    shift.startedAt != null || shift.completedAt != null || shift.noShowAt != null ||
    workedShiftIds.has(shift._id) ||
    (shift.eventStaffingPersonId != null && shift.personId !== shift.eventStaffingPersonId);
}

/** Preserve connected work groups, without freezing unrelated work for the same person. */
function preservedStaffingSourceIds(rows: Awaited<ReturnType<typeof readStaffingRows>>) {
  const preserved = new Set(storedStaffingSources(rows).filter((source) => source.performed).map((source) => source.id));
  const worked = new Set(rows.records.flatMap((record) => record.shiftId ? [record.shiftId] : []));
  const activeShifts = rows.shifts.filter((shift) => shift.status !== "cancelled");
  // A merged Shift is one work record: preserve all its source links together.
  // Source-free manual shifts remain untouched but do not claim unrelated roles.
  let added: boolean;
  do {
    added = false;
    for (const shift of activeShifts) {
      const ids = shift.eventStaffingSourceIds ?? [];
      if (!shiftPreservesWork(shift, worked) && !ids.some((id) => preserved.has(id))) continue;
      for (const id of ids) {
        if (!preserved.has(id)) { preserved.add(id); added = true; }
      }
    }
  } while (added);
  return preserved;
}

/** Validate references even when missing timing means no Shift can be made yet. */
export async function validateEventStaffingReferences(
  ctx: MutationCtx, eventId: Id<"events">, personId?: Id<"people">,
) {
  const auth = await getAuthContext(ctx);
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
    throw new ConvexError("Select an event in this workspace.");
  if (personId) {
    const person = await ctx.db.get(personId);
    if (!person || person.tenantId !== auth.tenantId || person.deletedAt != null || person.status !== "active")
      throw new ConvexError("Select an active staff member in this workspace.");
  }
}

/** Batching never makes caller-supplied timing authoritative. */
export async function validateEventStaffingTiming(
  ctx: MutationCtx, entity: "EventAssignment" | "EventStaffNeed", id: string, synchronizeShifts: unknown,
) {
  const row = entity === "EventAssignment"
    ? await ctx.db.get(id as Id<"eventAssignments">)
    : await ctx.db.get(id as Id<"eventStaffNeeds">);
  const auth = await getAuthContext(ctx);
  if (!row || row.tenantId !== auth.tenantId || row.deletedAt != null)
    throw new ConvexError("Staffing record not found in this workspace.");
  const rows = await readStaffingRows(ctx, row.eventId, row.tenantId);
  const worked = new Set(rows.records.flatMap((record) => record.shiftId ? [record.shiftId] : []));
  const linked = rows.shifts.filter((shift) => shift.status !== "cancelled" && shift.eventStaffingSourceIds?.includes(row._id));
  if (linked.some((shift) => shift.status !== "scheduled" || worked.has(shift._id) ||
    shift.startedAt != null || shift.completedAt != null || shift.noShowAt != null))
    throw new ConvexError("Recorded work keeps its staffing window.");
  if (row.followsEventTiming === true) {
    const crew = await readCrewWindow(ctx, row.eventId);
    if (!sameTime(row.startsAt, crew.startsAt) || !sameTime(row.endsAt, crew.endsAt) ||
      linked.some((shift) => shift.eventStaffingManagedAt == null))
      throw new ConvexError("Calculated staffing must match the event crew timeline.");
  } else if (synchronizeShifts === false) {
    const personId = "personId" in row ? row.personId : row.filledByPersonId;
    if (!linked.some((shift) => shift.eventStaffingManagedAt == null && shift.personId === personId &&
      sameTime(shift.startsAt, time(row.startsAt)) && sameTime(shift.endsAt, time(row.endsAt))))
      throw new ConvexError("A personal staffing window must stay connected to its shift.");
  }
}

/** Recompute the complete source group for every public automatic Shift command. */
export async function validateAutomaticEventShift(
  ctx: MutationCtx, shiftId: Id<"shifts">, operation: "schedule" | "plan" | "retire",
) {
  const auth = await getAuthContext(ctx);
  const shift = await ctx.db.get(shiftId);
  if (!shift || shift.tenantId !== auth.tenantId || shift.deletedAt != null)
    throw new ConvexError("Shift not found in this workspace.");
  if (operation === "schedule" && !shift.eventStaffingSourceIds?.length) return;
  if (!shift.eventId || shift.eventStaffingManagedAt == null ||
    shift.eventStaffingPersonId !== shift.personId || !shift.eventStaffingSourceIds?.length)
    throw new ConvexError("An automatic shift must stay linked to its event staffing.");
  const event = await ctx.db.get(shift.eventId);
  if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
    throw new ConvexError("Select an event in this workspace.");
  const rows = await readStaffingRows(ctx, event._id, event.tenantId);
  const worked = new Set(rows.records.flatMap((record) => record.shiftId ? [record.shiftId] : []));
  if (worked.has(shiftId) || shift.startedAt != null || shift.completedAt != null || shift.noShowAt != null)
    throw new ConvexError("Recorded work keeps its shift.");
  const sources = storedStaffingSources(rows).filter((source) => source.personId === shift.personId);
  const others = rows.shifts.filter((row) => row._id !== shiftId && row.status !== "cancelled" &&
    (row.personId === shift.personId || row.eventStaffingPersonId === shift.personId));
  if (operation === "retire") {
    if (shift.status !== "cancelled") throw new ConvexError("The automatic shift has not been retired.");
    if (event.stage === "cancelled") return;
    for (const source of sources.filter((source) => shift.eventStaffingSourceIds!.includes(source.id))) {
      if (!others.some((other) => other.eventStaffingSourceIds?.includes(source.id) &&
        (source.startsAt == null || source.endsAt == null ||
          (other.startsAt != null && other.endsAt != null && other.startsAt <= source.startsAt && other.endsAt >= source.endsAt))))
        throw new ConvexError("This shift is still needed by the event staffing plan.");
    }
    return;
  }
  const preservedIds = preservedStaffingSourceIds(rows);
  if (shift.status !== "scheduled" || ["cancelled", "completed", "closed_out"].includes(event.stage) ||
    shift.eventStaffingSourceIds.some((id) => preservedIds.has(id)))
    throw new ConvexError("Manual or performed staffing keeps its existing shifts.");
  const automaticSources = sources.filter((source) => !preservedIds.has(source.id));
  const intervals = staffingIntervals(automaticSources);
  const interval = intervals.find((item) => sameIds(sourceIds(item.sources), shift.eventStaffingSourceIds!) &&
    sameTime(shift.startsAt, item.startsAt) && sameTime(shift.endsAt, item.endsAt));
  const incomplete = automaticSources.filter((source) => shift.eventStaffingSourceIds!.includes(source.id));
  const unknownWindow = operation === "plan" && shift.startsAt == null && shift.endsAt == null && shift.scheduledAt == null &&
    sameIds(sourceIds(incomplete), shift.eventStaffingSourceIds) &&
    incomplete.every((source) => source.startsAt == null || source.endsAt == null);
  if ((!interval && !unknownWindow) || shift.role !== sourceRoles(interval?.sources ?? incomplete))
    throw new ConvexError("Automatic shifts must match the complete assigned staffing window and roles.");
  if (others.some((other) => sameIds(other.eventStaffingSourceIds ?? [], shift.eventStaffingSourceIds!) &&
    sameTime(other.startsAt, time(shift.startsAt)) && sameTime(other.endsAt, time(shift.endsAt))))
    throw new ConvexError("This staffing window already has a shift.");
}

/** Merge overlapping work, retaining separate shifts for real gaps/split days. */
function staffingIntervals(sources: readonly StaffingSource[]): StaffingInterval[] {
  const complete = sources.filter((source) => source.startsAt != null &&
    source.endsAt != null && source.endsAt > source.startsAt)
    .sort((left, right) => left.startsAt! - right.startsAt! || left.id.localeCompare(right.id));
  const intervals: StaffingInterval[] = [];
  for (const source of complete) {
    const previous = intervals.at(-1);
    if (previous && source.startsAt! <= previous.endsAt) {
      previous.endsAt = Math.max(previous.endsAt, source.endsAt!);
      previous.sources.push(source);
    } else intervals.push({ startsAt: source.startsAt!, endsAt: source.endsAt!, sources: [source] });
  }
  return intervals;
}

/** A personal shift edit replaces its calculated staffing window as well. */
export async function reflectManualEventShiftTiming(ctx: MutationCtx, shiftId: Id<"shifts">) {
  const auth = await getAuthContext(ctx);
  const shift = await ctx.db.get(shiftId);
  if (!shift || shift.tenantId !== auth.tenantId || shift.deletedAt != null ||
    !shift.eventId || !shift.eventStaffingSourceIds?.length ||
    shift.status !== "scheduled") return;
  const { assignments, needs, records } = await readStaffingRows(ctx, shift.eventId, shift.tenantId);
  if (records.some((row) => row.tenantId === shift.tenantId && row.deletedAt == null && row.shiftId === shiftId)) return;
  const linked = (row: { _id: string; tenantId: string; deletedAt?: number | null }) =>
    row.tenantId === shift.tenantId && row.deletedAt == null && shift.eventStaffingSourceIds!.includes(row._id);
  for (const row of assignments) {
    if (!linked(row) || row.personId !== shift.personId || !followsTiming(row) ||
      !["assigned", "confirmed"].includes(row.status) || row.checkedInAt != null ||
      row.checkedOutAt != null || row.noShowAt != null) continue;
    await ctx.runMutation(api.mutations.EventAssignment_planTiming, {
      docId: row._id, version: row.version, startsAt: shift.startsAt ?? undefined,
      endsAt: shift.endsAt ?? undefined, followsEventTiming: false, synchronizeShifts: false,
    });
  }
  for (const row of needs) {
    if (!linked(row) || row.status !== "filled" || row.filledByPersonId !== shift.personId || !followsTiming(row)) continue;
    await ctx.runMutation(api.mutations.EventStaffNeed_planTiming, {
      docId: row._id, version: row.version, startsAt: shift.startsAt ?? undefined,
      endsAt: shift.endsAt ?? undefined, followsEventTiming: false, synchronizeShifts: false,
    });
  }
}

async function readApprovedStaffingSwap(ctx: MutationCtx, requestId: Id<"shiftSwapRequests">) {
  const auth = await getAuthContext(ctx);
  const request = await ctx.db.get(requestId);
  if (!request || request.tenantId !== auth.tenantId || request.deletedAt != null ||
    request.status !== "approved" || request.requesterConfirmedAt == null ||
    request.recipientConfirmedAt == null || request.managerApprovedAt == null)
    throw new ConvexError("Staffing changes require the accepted, approved shift swap.");
  const shift = await ctx.db.get(request.shiftId);
  if (!shift || shift.tenantId !== auth.tenantId || shift.deletedAt != null ||
    shift.status !== "scheduled" || shift.personId !== request.recipientPersonId)
    throw new ConvexError("The approved swap must match the current shift and recipient.");
  const records = await ctx.db.query("timeRecords")
    .withIndex("by_shiftId", (q) => q.eq("shiftId", shift._id)).collect();
  if (shift.startedAt != null || shift.completedAt != null || shift.noShowAt != null ||
    records.some((row) => row.tenantId === auth.tenantId && row.deletedAt == null))
    throw new ConvexError("Recorded work stays with the person who performed it.");
  const rows = shift.eventId ? await readStaffingRows(ctx, shift.eventId, shift.tenantId) : null;
  const ids = new Set(shift.eventStaffingSourceIds ?? []);
  if (rows?.assignments.some((row) => ids.has(row._id) &&
    (row.checkedInAt != null || row.checkedOutAt != null || row.noShowAt != null)))
    throw new ConvexError("Recorded attendance stays with the person who performed it.");
  if (rows?.shifts.some((row) => row._id !== shift._id && row.status !== "cancelled" &&
    row.eventStaffingSourceIds?.some((id) => ids.has(id))))
    throw new ConvexError("This assignment also covers another shift. Separate its staffing windows before swapping one shift.");
  return { request, shift, rows, ids };
}

/** Public source commands must prove the exact durable approval and source link. */
export async function validateEventStaffingSwap(
  ctx: MutationCtx, entity: "EventAssignment" | "EventStaffNeed", id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { request, shift, rows, ids } = await readApprovedStaffingSwap(ctx, payload.shiftSwapRequestId as Id<"shiftSwapRequests">);
  const row = entity === "EventAssignment"
    ? rows?.assignments.find((item) => item._id === id)
    : rows?.needs.find((item) => item._id === id);
  const personId = row && ("personId" in row ? row.personId : row.filledByPersonId);
  if (!row || !ids.has(id) || row.eventId !== shift.eventId ||
    personId !== request.recipientPersonId || payload.personId !== request.recipientPersonId ||
    payload.previousPersonId !== request.requesterPersonId ||
    payload.acceptedAt !== request.recipientConfirmedAt)
    throw new ConvexError("This staffing record is not covered by the approved shift swap.");
  // A direct command can repair a legacy approved swap too. It must finish
  // every sibling source, never leave just this row transferred.
  await applyApprovedEventStaffingSwap(ctx, shift._id, request._id);
}

/** Approval moves every role in the swapped shift, with one atomic command chain. */
export async function applyApprovedEventStaffingSwap(
  ctx: MutationCtx, shiftId: Id<"shifts">, requestId: Id<"shiftSwapRequests">,
): Promise<void> {
  const { request, shift, rows, ids } = await readApprovedStaffingSwap(ctx, requestId);
  if (shift._id !== shiftId) throw new ConvexError("The approval belongs to a different shift.");
  if (!rows) return;
  for (const row of rows.assignments) {
    if (!ids.has(row._id) || row.status === "unassigned" || row.personId === request.recipientPersonId) continue;
    await ctx.runMutation(api.mutations.EventAssignment_applyApprovedShiftSwap, {
      docId: row._id, version: row.version, personId: request.recipientPersonId,
      shiftSwapRequestId: requestId, acceptedAt: request.recipientConfirmedAt!,
    });
    // Its callback reads the updated group and completes any remaining rows.
    // Return instead of applying stale snapshots after that nested completion.
    return;
  }
  for (const row of rows.needs) {
    if (!ids.has(row._id) || row.status !== "filled" || row.filledByPersonId === request.recipientPersonId) continue;
    await ctx.runMutation(api.mutations.EventStaffNeed_applyApprovedShiftSwap, {
      docId: row._id, version: row.version, personId: request.recipientPersonId,
      shiftSwapRequestId: requestId, acceptedAt: request.recipientConfirmedAt!,
    });
    return;
  }
}

function shiftHasRecordedWork(shift: Doc<"shifts">, rows: Awaited<ReturnType<typeof readStaffingRows>>) {
  return shift.startedAt != null || shift.completedAt != null || shift.noShowAt != null ||
    rows.records.some((record) => record.shiftId === shift._id) ||
    rows.assignments.some((row) => shift.eventStaffingSourceIds?.includes(row._id) &&
      (row.checkedInAt != null || row.checkedOutAt != null || row.noShowAt != null));
}

function remainingNeedCoverage(
  rows: Awaited<ReturnType<typeof readStaffingRows>>, shift: Doc<"shifts">,
  need: Doc<"eventStaffNeeds">, previousIds: readonly string[], previousRole?: string | null,
) {
  const sources = storedStaffingSources(rows).filter((source) =>
    source.personId === shift.personId && previousIds.includes(source.id));
  const previousSources = [...sources, {
    id: need._id, personId: need.filledByPersonId ?? null, role: need.role,
    startsAt: time(need.startsAt), endsAt: time(need.endsAt), followsEventTiming: followsTiming(need), performed: false,
  }];
  return {
    ids: sourceIds(sources),
    // Keep a manager's custom Shift role; remove a role derived from this need.
    role: previousRole === sourceRoles(previousSources) ? sourceRoles(sources) : previousRole,
  };
}

/** A direct child command must prove the same coverage removal as its parent. */
export async function validateStaffNeedCoverageRemoval(
  ctx: MutationCtx, shiftId: Id<"shifts">, payload: Record<string, unknown>,
): Promise<void> {
  const auth = await getAuthContext(ctx);
  const shift = await ctx.db.get(shiftId);
  const need = await ctx.db.get(payload.staffNeedId as Id<"eventStaffNeeds">);
  const previousIds = payload.previousSourceIds as string[];
  if (!shift || !need || !shift.eventId || shift.tenantId !== auth.tenantId ||
    need.tenantId !== auth.tenantId || shift.deletedAt != null || need.deletedAt != null ||
    need.eventId !== shift.eventId || need.status !== "cancelled" ||
    need.filledByPersonId !== shift.personId || !previousIds.includes(need._id))
    throw new ConvexError("This shift must belong to the cancelled staffing request.");
  const rows = await readStaffingRows(ctx, shift.eventId, shift.tenantId);
  if (shiftHasRecordedWork({ ...shift, eventStaffingSourceIds: previousIds }, rows))
    throw new ConvexError("Recorded work keeps its shift and staffing history.");
  const remaining = remainingNeedCoverage(rows, shift, need, previousIds, payload.previousRole as string | null | undefined);
  if (remaining.ids.length) {
    if (shift.status !== "scheduled" || !sameIds(shift.eventStaffingSourceIds ?? [], remaining.ids) ||
      (shift.role ?? null) !== (remaining.role ?? null))
      throw new ConvexError("Other assigned work must keep its shift and roles.");
  } else if (shift.status !== "cancelled" || !sameIds(shift.eventStaffingSourceIds ?? [], previousIds)) {
    throw new ConvexError("A removed staffing request must retire its unused future shift.");
  }
  // A direct call repairing legacy cancelled coverage must finish its siblings.
  await removeCancelledStaffNeedCoverage(ctx, need._id);
  await reconcileEventStaffing(ctx, shift.eventId);
}

/** Explicit request removal also releases its manually adjusted future coverage. */
export async function removeCancelledStaffNeedCoverage(ctx: MutationCtx, needId: Id<"eventStaffNeeds">): Promise<void> {
  const auth = await getAuthContext(ctx);
  const need = await ctx.db.get(needId);
  if (!need || need.tenantId !== auth.tenantId || need.deletedAt != null ||
    need.status !== "cancelled" || !need.filledByPersonId) return;
  const rows = await readStaffingRows(ctx, need.eventId, need.tenantId);
  for (const shift of rows.shifts) {
    if (shift.status !== "scheduled" || shift.personId !== need.filledByPersonId ||
      !shift.eventStaffingSourceIds?.includes(need._id) || shiftHasRecordedWork(shift, rows)) continue;
    const remaining = remainingNeedCoverage(rows, shift, need, shift.eventStaffingSourceIds, shift.role);
    await ctx.runMutation(api.mutations.Shift_removeStaffNeedCoverage, {
      docId: shift._id, version: shift.version, staffNeedId: need._id,
      remainingSourceIds: remaining.ids, role: remaining.role ?? undefined,
    });
    // Its callback completes the remaining group using fresh row versions.
    return;
  }
}

/** Every write uses the same generated command contract as UI/HTTP/MCP. */
export async function reconcileEventStaffing(ctx: MutationCtx, eventId: Id<"events">) {
  const auth = await getAuthContext(ctx);
  // Switching Workforce off must not block edits in the independent Event area.
  if (auth.disabledCapabilities.includes("workforce")) return;
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null) return;
  if (["completed", "closed_out"].includes(event.stage)) return;
  const { assignments, needs, shifts, records } = await readStaffingRows(ctx, eventId, event.tenantId);
  const local = <T extends { tenantId: string; deletedAt?: number | null }>(rows: T[]) =>
    rows.filter((row) => row.tenantId === event.tenantId && row.deletedAt == null);
  const liveShifts = local(shifts).filter((row) => row.status !== "cancelled");
  const workedShiftIds = new Set(local(records).flatMap((row) => row.shiftId ? [row.shiftId] : []));
  if (event.stage === "cancelled") {
    for (const shift of liveShifts) {
      if (shiftPreservesWork(shift, workedShiftIds)) continue;
      await ctx.runMutation(api.mutations.Shift_retireEventTiming, {
        docId: shift._id, version: shift.version, reason: "Event cancelled",
      });
    }
    return;
  }

  const { startsAt: crewStartsAt, endsAt: crewEndsAt } = await readCrewWindow(ctx, eventId);
  const preservedIds = preservedStaffingSourceIds({
    assignments: local(assignments), needs: local(needs), shifts: local(shifts), records: local(records),
  });
  const sources: StaffingSource[] = [];
  for (const row of local(assignments)) {
    if (row.status === "unassigned") continue;
    const performed = row.checkedInAt != null || row.checkedOutAt != null || row.noShowAt != null ||
      preservedIds.has(row._id);
    const followsEventTiming = followsTiming(row);
    const startsAt = followsEventTiming && !performed ? crewStartsAt : time(row.startsAt);
    const endsAt = followsEventTiming && !performed ? crewEndsAt : time(row.endsAt);
    if (followsEventTiming && !performed && (!sameTime(row.startsAt, startsAt) ||
      !sameTime(row.endsAt, endsAt) || row.followsEventTiming !== true)) {
      await ctx.runMutation(api.mutations.EventAssignment_planTiming, {
        docId: row._id, version: row.version, startsAt: startsAt ?? undefined,
        endsAt: endsAt ?? undefined, followsEventTiming: true, synchronizeShifts: false,
      });
    }
    sources.push({ id: row._id, personId: row.personId, role: row.role,
      startsAt, endsAt, followsEventTiming, performed });
  }
  for (const row of local(needs)) {
    if (row.status === "cancelled") continue;
    const followsEventTiming = followsTiming(row);
    const performed = preservedIds.has(row._id);
    const startsAt = followsEventTiming && !performed ? crewStartsAt : time(row.startsAt);
    const endsAt = followsEventTiming && !performed ? crewEndsAt : time(row.endsAt);
    if (followsEventTiming && !performed && (!sameTime(row.startsAt, startsAt) ||
      !sameTime(row.endsAt, endsAt) || row.followsEventTiming !== true)) {
      await ctx.runMutation(api.mutations.EventStaffNeed_planTiming, {
        docId: row._id, version: row.version, startsAt: startsAt ?? undefined,
        endsAt: endsAt ?? undefined, followsEventTiming: true, synchronizeShifts: false,
      });
    }
    if (row.status === "filled" && row.filledByPersonId) {
      sources.push({ id: row._id, personId: row.filledByPersonId, role: row.role,
        startsAt, endsAt, followsEventTiming, performed });
    }
  }

  const personIds = new Set([
    ...sources.flatMap((source) => source.personId ? [source.personId] : []),
    ...liveShifts.flatMap((shift) => shift.eventStaffingPersonId ? [shift.eventStaffingPersonId] : []),
  ]);
  for (const personId of personIds) {
    const personSources = sources.filter((source) => source.personId === personId && !source.performed);
    const existing = liveShifts.filter((shift) => shift.personId === personId &&
      !shiftPreservesWork(shift, workedShiftIds) &&
      !shift.eventStaffingSourceIds?.some((id) => preservedIds.has(id)));
    const intervals = staffingIntervals(personSources);
    const used = new Set<Id<"shifts">>();
    for (const interval of intervals) {
      const ids = sourceIds(interval.sources);
      const matches = existing.filter((shift) => !used.has(shift._id) &&
        shift.eventStaffingSourceIds?.some((id) => ids.includes(id)));
      const current = matches.find((shift) => sameTime(shift.startsAt, interval.startsAt) &&
        sameTime(shift.endsAt, interval.endsAt)) ?? matches[0];
      if (current) {
        used.add(current._id);
        if (!sameTime(current.startsAt, interval.startsAt) || !sameTime(current.endsAt, interval.endsAt) ||
          JSON.stringify(current.eventStaffingSourceIds ?? []) !== JSON.stringify(ids) || current.role !== sourceRoles(interval.sources)) {
          await ctx.runMutation(api.mutations.Shift_planEventTiming, {
            docId: current._id, version: current.version, startsAt: interval.startsAt,
            endsAt: interval.endsAt, eventStaffingSourceIds: ids, role: sourceRoles(interval.sources),
          });
        }
      } else {
        const created: { docId: Id<"shifts"> } = await ctx.runMutation(api.mutations.Shift_createViaSchedule, {
          eventId, personId, startsAt: interval.startsAt, endsAt: interval.endsAt,
          role: sourceRoles(interval.sources),
          eventStaffingSourceIds: ids,
        });
        used.add(created.docId);
      }
    }
    for (const shift of existing) {
      if (used.has(shift._id)) continue;
      const incomplete = personSources.filter((source) =>
        (source.startsAt == null || source.endsAt == null) &&
        shift.eventStaffingSourceIds?.includes(source.id));
      if (incomplete.length) {
        // Keep the same planning record, but remove obsolete calculated dates.
        if (shift.startsAt != null || shift.endsAt != null || shift.scheduledAt != null) {
          await ctx.runMutation(api.mutations.Shift_planEventTiming, {
            docId: shift._id, version: shift.version, eventStaffingSourceIds: sourceIds(incomplete), role: sourceRoles(incomplete),
          });
        }
      } else {
        await ctx.runMutation(api.mutations.Shift_retireEventTiming, {
          docId: shift._id, version: shift.version, reason: personSources.length
            ? "Staffing windows combined or changed" : "No longer assigned to this event",
        });
      }
    }
  }
}
