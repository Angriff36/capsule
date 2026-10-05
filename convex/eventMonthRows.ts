// PL-SCALE (AC-172): the pack lists, open questions, trucks and event
// numbers of the events a month screen shows. The tracker sheet read the
// company's whole lists of all four to fill one month. Here each comes
// through its by_eventId index. Each kind keeps the read rule of its
// generated list (all are staff reads). Pack list notes are left out: they
// are stored encrypted and the month screens do not show them.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";
import { MENU_EVENTS_CAP } from "./eventMenuLookup";

export type EventMonthRows = {
  packLists: Omit<Doc<"packLists">, "notes">[];
  reviewFlags: Doc<"reviewFlags">[];
  vehicleAssignments: (Doc<"eventVehicleAssignments"> & {
    isPreloaded: boolean;
    isReleased: boolean;
  })[];
  numberAssignments: Doc<"eventNumberAssignments">[];
};

/** Rows of these events (ids past MENU_EVENTS_CAP are ignored). */
export const forEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }): Promise<EventMonthRows | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return null;
    const tenantId = auth.tenantId;
    const rows: EventMonthRows = {
      packLists: [],
      reviewFlags: [],
      vehicleAssignments: [],
      numberAssignments: [],
    };
    for (const raw of [...new Set(eventIds)].slice(0, MENU_EVENTS_CAP)) {
      const eventId = ctx.db.normalizeId("events", raw);
      if (!eventId) continue;
      for (const list of await ctx.db
        .query("packLists")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect()) {
        if (list.tenantId !== tenantId || list.deletedAt != null) continue;
        const { notes: _notes, ...rest } = list;
        rows.packLists.push(rest);
      }
      for (const flag of await ctx.db
        .query("reviewFlags")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (flag.tenantId === tenantId && flag.deletedAt == null)
          rows.reviewFlags.push(flag);
      for (const rig of await ctx.db
        .query("eventVehicleAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (rig.tenantId === tenantId && rig.deletedAt == null)
          rows.vehicleAssignments.push({
            ...rig,
            isPreloaded: rig.preloadedAt != null,
            isReleased: rig.releasedAt != null,
          });
      for (const number of await ctx.db
        .query("eventNumberAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect())
        if (number.tenantId === tenantId) rows.numberAssignments.push(number);
    }
    return rows;
  },
});
