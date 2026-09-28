import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { readEventRouteLegsWithConflicts } from "./lib/eventRouteLegRead";

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
