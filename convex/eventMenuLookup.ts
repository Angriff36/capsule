// PL-SCALE (AC-172): menu lines for a few events, or for one dish, as plain
// rows. The generated every-event list (queries.listEventDish) reads every
// menu line of every event with its whole recipe tree; with 10,000 events
// and 20,000 lines it ran 15.8 s on a running backend and then failed.
// Screens that look at a week, one event or one dish read their lines here,
// each through an index. Same read rule as the generated list.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

/** Most events one call reads lines for. */
export const MENU_EVENTS_CAP = 500;
/** Most lines one dish lists. */
export const DISH_LINES_CAP = 2000;

/** Live menu lines of these events (ids past MENU_EVENTS_CAP are ignored). */
export const forEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }): Promise<Doc<"eventDishes">[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const rows: Doc<"eventDishes">[] = [];
    for (const raw of [...new Set(eventIds)].slice(0, MENU_EVENTS_CAP)) {
      const eventId = ctx.db.normalizeId("events", raw);
      if (!eventId) continue;
      const lines = await ctx.db
        .query("eventDishes")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect();
      for (const line of lines)
        if (line.tenantId === tenantId && line.deletedAt == null)
          rows.push(line);
    }
    return rows;
  },
});

/** Live menu lines that serve this dish, at most DISH_LINES_CAP. */
export const forDish = query({
  args: { dishId: v.string() },
  handler: async (ctx, { dishId }): Promise<Doc<"eventDishes">[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const id = ctx.db.normalizeId("dishes", dishId);
    if (!id) return [];
    const lines = await ctx.db
      .query("eventDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", id))
      .take(DISH_LINES_CAP);
    return lines.filter(
      (line) => line.tenantId === auth.tenantId && line.deletedAt == null,
    );
  },
});
