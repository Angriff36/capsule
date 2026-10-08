// The rows the planning board needs for the events it shows: staff, staff
// needs, trucks, equipment holds, pack lists and their lines, and plan needs
// of those events only, read by event through their indexes. The board used
// to load each of these tables whole (every event the company ever had), and
// on the live server those loads ran out of time.
//
// Same read rules as the generated list queries; a section this role may not
// read comes back empty, as those lists do. Encrypted notes are left out: the
// board does not show them.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";
import { RANGE_CAP } from "./eventLookup";

// As many events as the board's own event window can hold, so no event it
// shows comes back with its staff, trucks or pack lists missing.
export const PLAN_EVENT_CAP = RANGE_CAP;

type Live<T> = T & { deletedAt?: number | null };
const live = <T extends { deletedAt?: unknown }>(rows: T[]) =>
  rows.filter((row) => row.deletedAt == null);

export const forEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const empty = {
      assignments: [] as Doc<"eventAssignments">[],
      staffNeeds: [] as Doc<"eventStaffNeeds">[],
      rigs: [] as Array<
        Doc<"eventVehicleAssignments"> & {
          isPreloaded: boolean;
          isReleased: boolean;
        }
      >,
      reservations: [] as Doc<"equipmentReservations">[],
      packLists: [] as Doc<"packLists">[],
      packLines: [] as Array<
        Doc<"packListItems"> & { surplusQuantity: number }
      >,
      planNeeds: [] as Doc<"eventPlanNeeds">[],
    };
    if (!auth.tenantId) return empty;
    const tenantId = auth.tenantId;
    const ids: Id<"events">[] = [];
    for (const raw of [...new Set(eventIds)].slice(0, PLAN_EVENT_CAP)) {
      const id = ctx.db.normalizeId("events", raw);
      if (id) ids.push(id);
    }
    const mine = <T extends { tenantId: string }>(rows: Live<T>[]) =>
      live(rows).filter((row) => row.tenantId === tenantId);

    const readsWorkforce = canRead(auth, [
      "workforceAccess",
      "workforceSelfAccess",
    ]);
    const readsStaff = canRead(auth, ["staffAccess"]);
    const readsHolds = canRead(auth, [
      "inventoryAccess",
      "logisticsAccess",
      "eventManageAccess",
    ]);

    const out = empty;
    for (const eventId of ids) {
      if (readsWorkforce) {
        for (const row of mine(
          await ctx.db
            .query("eventAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
        ))
          out.assignments.push({ ...row, notes: undefined });
        out.staffNeeds.push(
          ...mine(
            await ctx.db
              .query("eventStaffNeeds")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
          ),
        );
      }
      if (readsStaff) {
        for (const row of mine(
          await ctx.db
            .query("eventVehicleAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
        ))
          out.rigs.push({
            ...row,
            isPreloaded: row.preloadedAt != null,
            isReleased: row.releasedAt != null,
          });
        out.planNeeds.push(
          ...mine(
            await ctx.db
              .query("eventPlanNeeds")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
          ),
        );
        const lists = mine(
          await ctx.db
            .query("packLists")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
        );
        for (const list of lists) {
          out.packLists.push({ ...list, notes: undefined });
          for (const line of mine(
            await ctx.db
              .query("packListItems")
              .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
              .collect(),
          ))
            out.packLines.push({
              ...line,
              surplusQuantity: Math.max(
                0,
                Number(line.packedQuantity) - Number(line.requiredQuantity),
              ),
            });
        }
      }
      if (readsHolds)
        out.reservations.push(
          ...mine(
            await ctx.db
              .query("equipmentReservations")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
          ),
        );
    }
    return out;
  },
});
