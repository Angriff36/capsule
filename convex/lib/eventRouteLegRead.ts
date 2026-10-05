import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  deriveRouteLegs,
  legBusyWindow,
  legConflicts,
  type LegConflict,
  type RigLegInput,
  type RouteLeg,
} from "../../src/lib/eventRouteLegs";
import {
  packLineTransport,
  rigCompatibilityProblem,
  rigLoad,
  rigOverloadMessage,
  routeStops,
  type LineTransport,
  type LoadLine,
  type RigUnit,
  type RouteStop,
} from "../../src/lib/rigLoad";
import { vehicleStatusProblem } from "./vehicleDeliveryAvailability";

/**
 * Reads an event's trucks, trailers and vendor drops and works out every run's
 * window from the event's own timing (PL-ROUTE-LEGS). Rows of another
 * workspace, released rows and deleted rows are never read as runs.
 */

export type RunSettings = {
  id: string;
  version: number;
  arriveBeforeServeMinutes: number | null;
  loadMinutes: number | null;
  leaveAfterMinutes: number | null;
  loadingZone: string | null;
  tripCost: number | null;
};

async function activeRigs(ctx: QueryCtx, event: Doc<"events">) {
  return (await ctx.db.query("eventVehicleAssignments")
    .withIndex("by_activeEventId", (q) => q.eq("activeEventId", String(event._id)))
    .collect())
    .filter((row) => row.tenantId === event.tenantId && row.deletedAt == null &&
      row.releasedAt == null && row.eventId === event._id);
}

async function rigInput(ctx: QueryCtx, row: Doc<"eventVehicleAssignments">): Promise<RigLegInput> {
  const [vehicle, trailer] = await Promise.all([
    row.vehicleId ? ctx.db.get(row.vehicleId) : null,
    row.trailerId ? ctx.db.get(row.trailerId) : null,
  ]);
  const own = <T extends { tenantId: string; registration: string }>(doc: T | null) =>
    doc && doc.tenantId === row.tenantId ? doc.registration : null;
  const parts = [own(vehicle), own(trailer)].filter((part): part is string => !!part);
  const label = parts.length
    ? parts.join(" + ")
    : row.vendorName?.trim() || (row.vehicleId || row.trailerId ? "Truck" : "Vendor");
  return {
    id: String(row._id),
    label,
    vehicleId: row.vehicleId ?? null,
    trailerId: row.trailerId ?? null,
    vendorName: row.vendorName ?? null,
    arriveBeforeServeMinutes: row.arriveBeforeServeMinutes ?? null,
    loadMinutes: row.loadMinutes ?? null,
    leaveAfterMinutes: row.leaveAfterMinutes ?? null,
  };
}

async function legsFor(ctx: QueryCtx, event: Doc<"events">) {
  const rows = await activeRigs(ctx, event);
  const rigs = await Promise.all(rows.map((row) => rigInput(ctx, row)));
  return deriveRouteLegs(event, rigs);
}

// --- PL-DELIVERY: booking, load and stop checks (AC-542, AC-550, AC-535) ---

const FINISHED_STAGES = ["cancelled", "completed", "closed_out"];

function eventLabel(event: Doc<"events">) {
  return event.eventNumber ? `event ${event.eventNumber} (${event.title})` : event.title;
}

function formatWindow(window: { startsAt: number; endsAt: number }, timeZone?: string | null) {
  const make = (zone: string) => new Intl.DateTimeFormat("en-US", {
    weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: zone,
  });
  let format: Intl.DateTimeFormat;
  try {
    format = make(timeZone || "UTC");
  } catch {
    format = make("UTC");
  }
  return `${format.format(window.startsAt)} to ${format.format(window.endsAt)}`;
}

async function venueTimeZone(ctx: QueryCtx, event: Doc<"events">) {
  if (!event.venueId) return null;
  const venue = await ctx.db.get(event.venueId).catch(() => null);
  return venue && venue.tenantId === event.tenantId ? (venue.timeZone ?? null) : null;
}

/** The run's busy window, or the whole event when the run times are not known yet. */
function runWindow(leg: RouteLeg | undefined, event: Doc<"events">) {
  const own = leg ? legBusyWindow(leg) : null;
  if (own) return own;
  const startsAt = event.startsAt;
  const endsAt = event.endsAt;
  return startsAt != null && endsAt != null && endsAt > startsAt ? { startsAt, endsAt } : null;
}

function rigUnit(doc: { registration: string; payloadCapacityKg: number; towCapacityKg?: number | null }): RigUnit {
  return { label: doc.registration, payloadCapacityKg: doc.payloadCapacityKg, towCapacityKg: doc.towCapacityKg ?? null };
}

async function ownRigDocs(ctx: QueryCtx, row: Doc<"eventVehicleAssignments">) {
  const [vehicle, trailer] = await Promise.all([
    row.vehicleId ? ctx.db.get(row.vehicleId) : null,
    row.trailerId ? ctx.db.get(row.trailerId) : null,
  ]);
  return {
    vehicle: vehicle && vehicle.tenantId === row.tenantId && vehicle.deletedAt == null ? vehicle : null,
    trailer: trailer && trailer.tenantId === row.tenantId && trailer.deletedAt == null ? trailer : null,
  };
}

/**
 * A truck or trailer is booked on an event only when it can go out and is free
 * for the run's window (spec §13.3, AC-542). Runs inside the same transaction
 * as EventVehicleAssignment.assign / planLeg, so a refusal leaves nothing.
 */
export async function validateEventVehicleAssignment(
  ctx: QueryCtx,
  assignmentId: Id<"eventVehicleAssignments">,
): Promise<void> {
  const row = await ctx.db.get(assignmentId);
  if (!row || row.deletedAt != null || row.releasedAt != null || row.activeEventId == null) return;
  const event = await ctx.db.get(row.eventId);
  if (!event || event.tenantId !== row.tenantId) return;
  const { vehicle, trailer } = await ownRigDocs(ctx, row);
  for (const unit of [vehicle, trailer]) {
    const problem = unit ? vehicleStatusProblem(unit.operationalStatus) : null;
    if (unit && problem) {
      throw new ConvexError(
        `${unit.registration} is ${problem}${unit.statusNote ? ` (${unit.statusNote})` : ""}. Pick another one or change its status first.`,
      );
    }
  }
  const compatibility = rigCompatibilityProblem(vehicle && rigUnit(vehicle), trailer && rigUnit(trailer));
  if (compatibility) throw new ConvexError(compatibility);

  // A run saved with a reason for being on two runs at once (planning board)
  // skips only the same-time check below; status and fit still apply.
  if (row.bookedTwiceReason?.trim()) return;
  const legs = await legsFor(ctx, event);
  const window = runWindow(legs.find((leg) => leg.id === String(row._id)), event);
  if (!window) return;
  const shared = [
    ...(row.vehicleId ? await ctx.db.query("eventVehicleAssignments")
      .withIndex("by_vehicleId", (q) => q.eq("vehicleId", row.vehicleId!)).collect() : []),
    ...(row.trailerId ? await ctx.db.query("eventVehicleAssignments")
      .withIndex("by_trailerId", (q) => q.eq("trailerId", row.trailerId!)).collect() : []),
  ].filter((other) => other._id !== row._id && other.tenantId === row.tenantId &&
    other.deletedAt == null && other.releasedAt == null && other.activeEventId != null);
  const legsByEvent = new Map<string, RouteLeg[]>([[String(event._id), legs]]);
  for (const other of shared) {
    const otherEvent = other.eventId === event._id ? event : await ctx.db.get(other.eventId);
    if (!otherEvent || otherEvent.tenantId !== row.tenantId || otherEvent.deletedAt != null ||
      FINISHED_STAGES.includes(otherEvent.stage)) continue;
    let otherLegs = legsByEvent.get(String(otherEvent._id));
    if (!otherLegs) {
      otherLegs = await legsFor(ctx, otherEvent);
      legsByEvent.set(String(otherEvent._id), otherLegs);
    }
    const otherWindow = runWindow(otherLegs.find((leg) => leg.id === String(other._id)), otherEvent);
    if (!otherWindow || !(otherWindow.startsAt < window.endsAt && window.startsAt < otherWindow.endsAt)) continue;
    const unit = row.vehicleId && other.vehicleId === row.vehicleId ? vehicle : trailer;
    const where = otherEvent._id === event._id ? "another run of this event" : eventLabel(otherEvent);
    throw new ConvexError(
      `${unit?.registration ?? "This truck"} is already out for ${where}, ${formatWindow(otherWindow, await venueTimeZone(ctx, otherEvent))}. Give this run other times (a drop run or a later trip), or pick another truck.`,
    );
  }
}

async function eventPackLines(ctx: QueryCtx, event: Doc<"events">) {
  const lists = (await ctx.db.query("packLists").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).collect())
    .filter((list) => list.tenantId === event.tenantId && list.deletedAt == null && list.status !== "cancelled");
  return (await Promise.all(lists.map((list) => ctx.db.query("packListItems")
    .withIndex("by_packListId", (q) => q.eq("packListId", list._id)).collect()))).flat()
    .filter((line) => line.tenantId === event.tenantId && line.deletedAt == null);
}

function loadLine(line: Doc<"packListItems">): LoadLine {
  return {
    description: line.description,
    unitWeightKg: line.unitWeightKg ?? null,
    requiredQuantity: line.requiredQuantity,
    packedQuantity: line.packedQuantity,
    excluded: line.excludedAt != null,
    retired: line.retiredAt != null,
  };
}

/** What each rig on the event carries against what it can carry (AC-550). */
export async function readEventRigLoads(ctx: QueryCtx, event: Doc<"events">) {
  const rows = await activeRigs(ctx, event);
  const trucks = rows.filter((row) => row.vehicleId != null || row.trailerId != null);
  const lines = await eventPackLines(ctx, event);
  return Promise.all(trucks.map(async (row) => {
    const { vehicle, trailer } = await ownRigDocs(ctx, row);
    const carried = lines.filter((line) => line.loadAssignmentId === row._id ||
      (line.loadAssignmentId == null && trucks.length === 1));
    const label = (await rigInput(ctx, row)).label;
    const load = rigLoad(vehicle && rigUnit(vehicle), trailer && rigUnit(trailer), carried.map(loadLine));
    return { id: String(row._id), label, ...load, message: rigOverloadMessage(label, load) };
  }));
}

/** Refuses a line placement or weight that puts a rig past what it can carry. */
export async function validateRigLoadForLine(ctx: QueryCtx, lineId: Id<"packListItems">): Promise<void> {
  const line = await ctx.db.get(lineId);
  if (!line || line.deletedAt != null) return;
  const list = await ctx.db.get(line.packListId);
  if (!list || list.tenantId !== line.tenantId) return;
  const event = await ctx.db.get(list.eventId);
  if (!event || event.tenantId !== line.tenantId) return;
  for (const rig of await readEventRigLoads(ctx, event)) {
    if (rig.message && (line.loadAssignmentId == null || rig.id === String(line.loadAssignmentId))) {
      throw new ConvexError(rig.message);
    }
  }
}

async function nameOf(ctx: QueryCtx, tenantId: string, personId: string | null | undefined) {
  if (!personId) return null;
  const person = await ctx.db.get(personId as Id<"people">).catch(() => null);
  if (!person || person.tenantId !== tenantId) return null;
  return [person.givenName, person.familyName].filter(Boolean).join(" ") || null;
}

/** Stops of every run with windows and named crew (AC-550). */
export async function readEventRouteStops(ctx: QueryCtx, event: Doc<"events">): Promise<RouteStop[]> {
  const rows = await activeRigs(ctx, event);
  const legs = await legsFor(ctx, event);
  const assignments = (await ctx.db.query("eventAssignments").withIndex("by_eventId", (q) => q.eq("eventId", event._id)).collect())
    .filter((row) => row.tenantId === event.tenantId && row.deletedAt == null);
  const crewByLeg: Record<string, string[]> = {};
  const vendorByLeg: Record<string, string> = {};
  for (const row of rows) {
    const id = String(row._id);
    if (row.vendorName?.trim() && !row.vehicleId && !row.trailerId) vendorByLeg[id] = row.vendorName.trim();
    const names: string[] = [];
    const driver = await nameOf(ctx, row.tenantId, row.driverId);
    if (driver) names.push(`${driver} (driver)`);
    for (const rider of assignments.filter((a) => a.rideVehicleAssignmentId === id && a.status !== "unassigned" && a.status !== "no_show")) {
      const name = await nameOf(ctx, row.tenantId, rider.personId);
      if (name && !names.some((existing) => existing.startsWith(name))) names.push(name);
    }
    crewByLeg[id] = names;
  }
  return routeStops(legs, crewByLeg, vendorByLeg);
}

/** Truck, trip, loading zone, times and food hold window of each pack line (AC-535). */
export async function readPackLineTransport(ctx: QueryCtx, event: Doc<"events">): Promise<LineTransport[]> {
  const rows = await activeRigs(ctx, event);
  const legs = await legsFor(ctx, event);
  const zones = Object.fromEntries(rows.map((row) => [String(row._id), row.loadingZone ?? null]));
  const lines = (await eventPackLines(ctx, event)).filter((line) => line.retiredAt == null && line.excludedAt == null);
  return packLineTransport(lines.map((line) => ({
    id: String(line._id),
    loadAssignmentId: line.loadAssignmentId ? String(line.loadAssignmentId) : null,
    category: line.category ?? null,
    isFood: line.dishId != null || line.dishContainerId != null || line.eventDishId != null,
  })), legs, zones, event.serviceStartsAt ?? null);
}

/** Every run's window for one event; null when the event is not in this workspace. */
export async function readEventRouteLegs(
  ctx: QueryCtx,
  eventId: Id<"events">,
  tenantId: string,
): Promise<RouteLeg[] | null> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null) return null;
  return legsFor(ctx, event);
}

/** Runs plus any truck or trailer booked twice, on this event or another live one. */
export async function readEventRouteLegsWithConflicts(
  ctx: QueryCtx,
  eventId: Id<"events">,
  tenantId: string,
): Promise<{ legs: RouteLeg[]; conflicts: LegConflict[]; runs: RunSettings[] } | null> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || event.deletedAt != null) return null;
  const rows = await activeRigs(ctx, event);
  const legs = deriveRouteLegs(event, await Promise.all(rows.map((row) => rigInput(ctx, row))));
  // Each run's own settings, so a screen can change them.
  const runs = rows.map((row) => ({
    id: String(row._id),
    version: row.version,
    arriveBeforeServeMinutes: row.arriveBeforeServeMinutes ?? null,
    loadMinutes: row.loadMinutes ?? null,
    leaveAfterMinutes: row.leaveAfterMinutes ?? null,
    loadingZone: row.loadingZone ?? null,
    tripCost: row.tripCost ?? null,
  }));
  const vehicleIds = new Set(legs.flatMap((leg) => leg.vehicleId ? [leg.vehicleId] : []));
  const trailerIds = new Set(legs.flatMap((leg) => leg.trailerId ? [leg.trailerId] : []));
  const shared = [
    ...(await Promise.all([...vehicleIds].map((id) => ctx.db.query("eventVehicleAssignments")
      .withIndex("by_vehicleId", (q) => q.eq("vehicleId", id as Id<"vehicles">)).collect()))).flat(),
    ...(await Promise.all([...trailerIds].map((id) => ctx.db.query("eventVehicleAssignments")
      .withIndex("by_trailerId", (q) => q.eq("trailerId", id as Id<"trailers">)).collect()))).flat(),
  ];
  const otherEventIds = new Set(shared
    .filter((row) => row.tenantId === tenantId && row.deletedAt == null && row.releasedAt == null &&
      row.activeEventId != null && row.eventId !== event._id)
    .map((row) => row.eventId));
  const others: (RouteLeg & { eventLabel: string })[] = [];
  for (const otherId of otherEventIds) {
    const other = await ctx.db.get(otherId);
    if (!other || other.tenantId !== tenantId || other.deletedAt != null ||
      ["cancelled", "completed", "closed_out"].includes(other.stage)) continue;
    const eventLabel = other.eventNumber ? `event ${other.eventNumber} (${other.title})` : other.title;
    for (const leg of await legsFor(ctx, other)) {
      if (leg.kind === "rig") others.push({ ...leg, eventLabel });
    }
  }
  return { legs, conflicts: legConflicts(legs, others), runs };
}
