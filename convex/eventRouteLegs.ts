import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  readEventRigLoads,
  readEventRouteLegsWithConflicts,
  readEventRouteStops,
  readPackLineTransport,
} from "./lib/eventRouteLegRead";

/**
 * Each truck's, vendor's and the main crew's times for one event, worked out
 * from the same event timing, plus trucks or trailers booked twice
 * (PL-ROUTE-LEGS, spec §8.4). Read only: the times are never typed in here.
 */
export const getEventRouteLegs = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("events", eventId);
    if (!id) return null;
    return readEventRouteLegsWithConflicts(ctx, id, auth.tenantId);
  },
});

/**
 * Stops with windows and crew, what each truck carries against what it can
 * carry, and the truck, trip, loading zone and food hold window of every pack
 * line (PL-DELIVERY, spec §13.3). Read only.
 */
export const getEventTransport = query({
  args: { eventId: v.string() },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous") return null;
    const id = ctx.db.normalizeId("events", eventId);
    if (!id) return null;
    const event = await ctx.db.get(id);
    if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
      return null;
    const [stops, rigLoads, lines] = await Promise.all([
      readEventRouteStops(ctx, event),
      readEventRigLoads(ctx, event),
      readPackLineTransport(ctx, event),
    ]);
    return { stops, rigLoads, lines };
  },
});
