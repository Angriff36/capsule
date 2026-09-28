import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  deriveRouteLegs,
  legConflicts,
  type LegConflict,
  type RigLegInput,
  type RouteLeg,
} from "../../src/lib/eventRouteLegs";

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
