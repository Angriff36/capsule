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
// The board shows at most 42 days. More events than this on one screen is
// more than a person can plan from; the board says so and asks for the week
// view instead of reading on (and never drops rows without saying).
export const PLAN_EVENT_CAP = 400;

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
    if (!auth.tenantId) return { ...empty, capped: false };
    const tenantId = auth.tenantId;
    const ids: Id<"events">[] = [];
    for (const raw of new Set(eventIds)) {
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

    const capped = ids.length > PLAN_EVENT_CAP;
    if (capped) return { ...empty, capped };
    const out = { ...empty, capped };
    // All events at once, not one after another.
    const perEvent = await Promise.all(
      ids.map(async (eventId) => {
        const [assignments, staffNeeds, rigs, planNeeds, lists, holds] =
          await Promise.all([
            readsWorkforce
              ? ctx.db
                  .query("eventAssignments")
                  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                  .collect()
              : [],
            readsWorkforce
              ? ctx.db
                  .query("eventStaffNeeds")
                  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                  .collect()
              : [],
            readsStaff
              ? ctx.db
                  .query("eventVehicleAssignments")
                  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                  .collect()
              : [],
            readsStaff
              ? ctx.db
                  .query("eventPlanNeeds")
                  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                  .collect()
              : [],
            readsStaff
              ? ctx.db
                  .query("packLists")
                  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                  .collect()
              : [],
            readsHolds
              ? ctx.db
                  .query("equipmentReservations")
                  .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
                  .collect()
              : [],
          ]);
        const packLists = mine(lists);
        const packLines = (
          await Promise.all(
            packLists.map((list) =>
              ctx.db
                .query("packListItems")
                .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
                .collect(),
            ),
          )
        ).flat();
        return {
          assignments: mine(assignments),
          staffNeeds: mine(staffNeeds),
          rigs: mine(rigs),
          planNeeds: mine(planNeeds),
          packLists,
          packLines: mine(packLines),
          reservations: mine(holds),
        };
      }),
    );
    for (const rows of perEvent) {
      for (const row of rows.assignments)
        out.assignments.push({ ...row, notes: undefined });
      out.staffNeeds.push(...rows.staffNeeds);
      for (const row of rows.rigs)
        out.rigs.push({
          ...row,
          isPreloaded: row.preloadedAt != null,
          isReleased: row.releasedAt != null,
        });
      out.planNeeds.push(...rows.planNeeds);
      for (const list of rows.packLists)
        out.packLists.push({ ...list, notes: undefined });
      for (const line of rows.packLines)
        out.packLines.push({
          ...line,
          surplusQuantity: Math.max(
            0,
            Number(line.packedQuantity) - Number(line.requiredQuantity),
          ),
        });
      out.reservations.push(...rows.reservations);
    }
    return out;
  },
});
