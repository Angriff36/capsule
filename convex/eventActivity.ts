/**
 * AUTHOR SEAM - what happened on one event, newest first.
 *
 * Every command already writes a row to the manifestEvents ledger. This read
 * gathers the rows of the event itself and of its day-of records (crew,
 * crew positions, trucks, trip checks, pack lists and their touched lines,
 * equipment holds, to-dos, timeline blocks, reasons for leaving or changing
 * the plan with open items) and says each one in plain words.
 *
 * Read only. It returns the kind of change, when, and a short operational
 * detail (an item name, a role, a reason, an amount). It never returns the
 * stored payload, so money, contact details and private notes stay out.
 * Any signed-in member of the event's workspace may read it: the same people
 * who may read the event.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

/** Most day-of records of one kind read for one event. */
const MAX_RECORDS = 1000;
const MAX_ROWS = 250;

const TEXT: Record<string, string> = {
  EventDraftCaptured: "Event drafted",
  EventPlanned: "Event planned",
  EventScheduleChanged: "Date or time changed",
  EventHeadcountChanged: "Guest count changed",
  EventVenueChanged: "Venue changed",
  EventServiceStyleChanged: "Service style changed",
  EventOwnerAssigned: "Owner changed",
  EventRequirementsChanged: "Requirements changed",
  EventTimingConfigured: "Timing planned",
  EventSubmittedForApproval: "Sent for approval",
  EventReturnedToPlanning: "Sent back to planning",
  EventApproved: "Approved",
  EventExecutionStarted: "Event started",
  EventCompleted: "Event finished",
  EventCancelled: "Event cancelled",
  EventClosedOut: "Event closed out",
  EventArchived: "Event archived",
  EventReactivated: "Event brought back",
  EventNumberSet: "Event number set",
  EventBinderBuilt: "Binder built",
  EventAssignmentAssigned: "Crew member put on the event",
  EventAssignmentConfirmed: "Crew member confirmed",
  EventAssignmentCheckedIn: "Crew member checked in",
  EventAssignmentCheckedOut: "Crew member checked out",
  EventAssignmentNoShowMarked: "Crew member marked no-show",
  EventAssignmentUnassigned: "Crew member taken off the event",
  EventAssignmentDeclined: "Crew member said they can't work it",
  EventStaffNeedPosted: "Crew position opened",
  EventStaffNeedClaimed: "Crew position claimed",
  EventStaffNeedFilled: "Crew position filled",
  EventStaffNeedReleased: "Crew position claim released",
  EventStaffNeedCancelled: "Crew position cancelled",
  EventVehicleAssigned: "Truck put on the event",
  EventVehicleReleased: "Truck taken off the event",
  EventVehiclePreloaded: "Truck marked loaded ahead",
  EventVehiclePreloadCleared: "Truck unloaded again",
  EventVehicleLegPlanned: "Truck run times changed",
  VehicleTripChecked: "Trip check saved",
  PackListOpened: "Pack list opened",
  PackListPackingStarted: "Packing started",
  PackListPacked: "Pack list marked packed",
  PackListLoaded: "Pack list marked loaded",
  PackListDispatched: "Pack list sent out",
  PackListCancelled: "Pack list cancelled",
  PackListAssistanceRequested: "Packer asked for help",
  PackListAssistanceResolved: "Help given to the packer",
  PackListItemAdded: "Pack line added",
  PackListItemCountRecorded: "Packed count saved",
  PackListItemPacked: "Pack line packed",
  PackListItemMissing: "Pack line marked missing",
  PackListItemChecked: "Pack line checked a second time",
  PackListItemLoaded: "Pack line counted onto the truck",
  PackListItemReturnCounted: "Pack line counted back in",
  PackListItemExcluded: "Pack line left off the truck",
  PackListItemRemoved: "Pack line removed",
  PackListItemSentInsteadRecorded: "Stand-in recorded for a pack line",
  PackListItemQuantityAdjusted: "Pack line amount changed",
  EquipmentReserved: "Equipment held",
  EquipmentCheckedOut: "Equipment checked out",
  EquipmentReturned: "Equipment returned",
  EquipmentReservationCancelled: "Equipment hold cancelled",
  DeliveryScheduled: "Delivery scheduled",
  DeliveryTransitStarted: "Delivery left",
  DeliveryConfirmed: "Delivery handed over",
  DeliveryFailed: "Delivery failed",
  DeliveryCancelled: "Delivery cancelled",
  DepartureOverrideRecorded: "Sent out with open items",
  PlanningOverrideRecorded: "Plan changed with open items",
  EventPlanNeedsNoted: "Event needs saved",
  EventTaskAdded: "To-do added",
  EventTaskRevised: "To-do changed",
  EventTaskOwnerChanged: "To-do handed over",
  EventTaskStarted: "To-do started",
  EventTaskCompleted: "To-do done",
  EventTaskSkipped: "To-do skipped",
  EventTaskReopened: "To-do reopened",
  EventTaskRemoved: "To-do removed",
  EventTimelineActivityScheduled: "Timeline block added",
  EventTimelineActivityAdjusted: "Timeline block changed",
  EventTimelineActivityCompleted: "Timeline block done",
  EventTimelineActivityReopened: "Timeline block reopened",
  EventTimelineActivityRemoved: "Timeline block removed",
};

/** "PackListItemPacked" -> "Pack list item packed" for a type not listed. */
function plain(type: string): string {
  const words = type.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const word = (value: unknown) =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** A short operational detail; never money, contacts or notes. */
function detailOf(payload: unknown): string | null {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  const subject =
    word(p.description) ?? word(p.title) ?? word(p.name) ?? word(p.role);
  if (subject) parts.push(subject);
  const packed = number(p.packedQuantity);
  const required = number(p.requiredQuantity);
  if (packed != null && required != null)
    parts.push(`${packed} of ${required}`);
  for (const [key, label] of [
    ["checkedQuantity", "checked"],
    ["loadedQuantity", "on the truck"],
    ["returnedQuantity", "back"],
    ["lostQuantity", "lost"],
    ["damagedQuantity", "broken"],
  ] as const) {
    const amount = number(p[key]);
    if (amount != null && (amount > 0 || key === "returnedQuantity"))
      parts.push(`${amount} ${label}`);
  }
  const reason = word(p.reason);
  if (reason) parts.push(`reason: ${reason}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

const PERSON_FIELDS = [
  "personId",
  "driverId",
  "loadedByPersonId",
  "dispatchedByPersonId",
  "assignedToId",
];

async function personNameOf(
  ctx: QueryCtx,
  tenantId: string,
  payload: unknown,
): Promise<string | null> {
  if (payload == null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  for (const field of PERSON_FIELDS) {
    const raw = word(p[field]);
    if (!raw) continue;
    const id = ctx.db.normalizeId("people", raw);
    if (!id) continue;
    const person = await ctx.db.get(id);
    if (!person || person.tenantId !== tenantId) continue;
    const name = `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim();
    if (name) return name;
  }
  return null;
}

/**
 * The newest ledger rows across many records, newest first. Each record's
 * rows are read newest first and merged one row at a time, so a record with
 * a recent change is never left out because other records came first, and
 * no more rows are read than are shown (plus one per record).
 */
async function newestAcross(
  ctx: QueryCtx,
  entityIds: string[],
  limit: number,
): Promise<{ rows: Doc<"manifestEvents">[]; more: boolean }> {
  const streams = entityIds.map((entityId) =>
    ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", entityId))
      .order("desc")
      [Symbol.asyncIterator](),
  );
  const heads = await Promise.all(streams.map((stream) => stream.next()));
  const rows: Doc<"manifestEvents">[] = [];
  while (rows.length < limit) {
    let best = -1;
    for (let index = 0; index < heads.length; index += 1) {
      const head = heads[index];
      if (head.done) continue;
      const top = best < 0 ? null : heads[best];
      if (
        !top ||
        top.done ||
        head.value._creationTime > top.value._creationTime
      )
        best = index;
    }
    if (best < 0) break;
    const head = heads[best];
    if (head.done) break;
    rows.push(head.value);
    heads[best] = await streams[best].next();
  }
  return { rows, more: heads.some((head) => !head.done) };
}

export const listEventActivity = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("events", eventId);
    if (!id) return null;
    const event = await ctx.db.get(id);
    if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
      return null;
    // History shows crew, trucks, packing and reasons, so it follows the
    // event's own read rule: the generated event read decides, not a copy
    // of the role list kept here.
    const readable: unknown = await ctx.runQuery(api.queries.getEvent, { id });
    if (readable == null) return null;
    const tenantId = auth.tenantId;

    // The event's day-of records, newest first (so a cut keeps the newest),
    // read by event and kept to this workspace.
    const own = <T extends { tenantId: string }>(rows: T[]) =>
      rows.filter((row) => row.tenantId === tenantId);
    const byEvent = { eventId: id as never };
    const [
      assignments,
      needs,
      rigs,
      tripChecks,
      packLists,
      holds,
      deliveries,
      leaveReasons,
      planReasons,
      planNeeds,
      tasks,
      blocks,
    ] = await Promise.all([
      ctx.db
        .query("eventAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("eventStaffNeeds")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("eventVehicleAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("vehicleTripChecks")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("packLists")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("equipmentReservations")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("deliveries")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("departureOverrides")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("planningOverrides")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("eventPlanNeeds")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("eventTasks")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
      ctx.db
        .query("eventTimelineActivities")
        .withIndex("by_eventId", (q) => q.eq("eventId", byEvent.eventId))
        .order("desc")
        .take(MAX_RECORDS),
    ]);
    const kinds: Array<Array<{ _id: string; tenantId: string }>> = [
      assignments,
      needs,
      rigs,
      tripChecks,
      packLists,
      holds,
      deliveries,
      leaveReasons,
      planReasons,
      planNeeds,
      tasks,
      blocks,
    ];
    let cut = kinds.some((rows) => rows.length >= MAX_RECORDS);

    // Pack lines: only the ones somebody counted, marked or left off.
    const lists = own(packLists);
    const touched: string[] = [];
    for (const list of lists) {
      const lines = await ctx.db
        .query("packListItems")
        .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
        .order("desc")
        .take(MAX_RECORDS);
      if (lines.length >= MAX_RECORDS) cut = true;
      for (const line of lines) {
        if (line.tenantId !== tenantId) continue;
        if (
          Number(line.packedQuantity) > 0 ||
          line.missingAt != null ||
          line.excludedAt != null ||
          line.sentInstead != null ||
          line.returnCountedAt != null
        )
          touched.push(String(line._id));
      }
    }

    const ids = [
      String(id),
      ...kinds.flatMap((rows) => own(rows).map((row) => String(row._id))),
      ...touched,
    ];
    const { rows: newest, more } = await newestAcross(ctx, ids, MAX_ROWS);

    const rows = await Promise.all(
      newest.map(async (row) => ({
        id: String(row._id),
        at: row.createdAt,
        type: row.type,
        text: TEXT[row.type] ?? plain(row.type),
        detail: detailOf(row.payload),
        person: await personNameOf(ctx, tenantId, row.payload),
      })),
    );
    return { rows, truncated: cut || more };
  },
});
