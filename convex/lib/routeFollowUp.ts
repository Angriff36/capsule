import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { routeProviderConfigured } from "./routeProvider";

/** Event changes that can move a drive time (spec §8.4 recalculation). */
const ROUTE_INPUT_EVENTS = new Set([
  "EventVenueChanged",
  "EventScheduleChanged",
  "EventTimingConfigured",
  "EventOperatingLocationChosen",
]);

/** A minute's wait lets a burst of edits settle into one fetch. */
const SETTLE_MS = 60_000;

/**
 * Queues a drive-time check after an event change that can move it. The
 * check (eventRoutes.refreshIfDue) fetches only when a leg is out of date or
 * missing and both addresses resolve, so the travel update it makes itself
 * (EventTimingConfigured again) finds everything current and stops.
 */
export async function queueRouteRefresh(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  if (event.entity !== "Event" || !ROUTE_INPUT_EVENTS.has(event.type)) return;
  if (!routeProviderConfigured()) return;
  const row = await ctx.db.get(event.entityId as Id<"events">);
  if (!row || row.deletedAt != null) return;
  await ctx.scheduler.runAfter(SETTLE_MS, internal.eventRoutes.refreshIfDue, {
    tenantId: row.tenantId,
    eventId: row._id,
  });
}
