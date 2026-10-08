// Facilities and fleet screens read only what they show: the latest service
// of each maintenance task shown, the maintenance due soon, each truck's
// latest odometer reading and the newest page of its fuel and service log,
// one month of rental holds, lines and problems, the leads and notes of the
// venues shown, and one venue's events. They used to load each of these
// tables whole (every row the company ever had), and on the live server
// those loads ran out of time.
//
// Same read rules and computed fields as the generated list queries in
// convex/queries.ts; a part this role may not read comes back empty, as
// those lists do.
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import type { EventLookupRow } from "./eventLookup";
import { canRead } from "./search";

type Live = { deletedAt?: number | null; tenantId: string };
const mineLive = <T extends Live>(rows: T[], tenantId: string) =>
  rows.filter((row) => row.deletedAt == null && row.tenantId === tenantId);

const DAY_MS = 86_400_000;
/** Ids per call: more than one screen shows. */
const IDS_CAP = 200;
/** Entries read per task or truck for its latest service and count. */
const PER_ITEM_CAP = 500;
/** Rows counted per table for a screen's total ("2000+" past this). */
const COUNT_CAP = 2000;
/** Newest rows read per truck for its current odometer. */
const READING_ROWS = 50;
/** Holds start and end near their event: events this far either side of the month are read for holds that reach into it. */
const HOLD_REACH_MS = 60 * DAY_MS;
const PAGE_CAP = 1000;

const readsEquipmentService = (auth: Parameters<typeof canRead>[0]) =>
  canRead(auth, ["inventoryAccess", "logisticsAccess"]);
const readsFleet = (auth: Parameters<typeof canRead>[0]) =>
  canRead(auth, ["logisticsAccess", "manageAccess"]);

/**
 * For each of these maintenance tasks: its latest logged service (by
 * completion) and how many services it has on file; and how many services
 * the company has logged in all.
 */
export const equipmentServiceSummary = query({
  args: { taskIds: v.array(v.string()) },
  handler: async (ctx, { taskIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      tasks: [] as Array<{
        taskId: string;
        latest: Doc<"equipmentServiceEntries"> | null;
        count: number;
        capped: boolean;
      }>,
      total: 0,
      totalCapped: false,
    };
    if (!auth.tenantId || !readsEquipmentService(auth)) return out;
    const tenantId = auth.tenantId;
    for (const raw of [...new Set(taskIds)].slice(0, IDS_CAP)) {
      const taskId = ctx.db.normalizeId("equipmentMaintenanceTasks", raw);
      if (!taskId) continue;
      const read = await ctx.db
        .query("equipmentServiceEntries")
        .withIndex("by_maintenanceTaskId", (q) =>
          q.eq("maintenanceTaskId", taskId),
        )
        .order("desc")
        .take(PER_ITEM_CAP);
      const logged = mineLive(read, tenantId).filter(
        (row) => row.loggedAt != null,
      );
      let latest: Doc<"equipmentServiceEntries"> | null = null;
      for (const row of logged)
        if (
          latest == null ||
          Number(row.completedAt ?? 0) > Number(latest.completedAt ?? 0)
        )
          latest = row;
      out.tasks.push({
        taskId: raw,
        latest,
        count: logged.length,
        capped: read.length === PER_ITEM_CAP,
      });
    }
    const all = await ctx.db
      .query("equipmentServiceEntries")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .take(COUNT_CAP);
    out.total = mineLive(all, tenantId).filter(
      (row) => row.loggedAt != null,
    ).length;
    out.totalCapped = all.length === COUNT_CAP;
    return out;
  },
});

/** Maintenance tasks due on or before `before` (overdue ones included). */
export const maintenanceDueBefore = query({
  args: { before: v.number() },
  handler: async (ctx, { before }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !readsEquipmentService(auth)) return [];
    const tenantId = auth.tenantId;
    return mineLive(
      await ctx.db
        .query("equipmentMaintenanceTasks")
        .withIndex("by_tenantId_and_nextDueAt", (q) =>
          q.eq("tenantId", tenantId).lte("nextDueAt", before),
        )
        .collect(),
      tenantId,
    ).filter((row) => row.nextDueAt != null);
  },
});

/**
 * Each truck's current odometer: the highest reading among its newest fuel
 * and service entries.
 */
export const vehicleOdometers = query({
  args: { vehicleIds: v.array(v.string()) },
  handler: async (ctx, { vehicleIds }) => {
    const auth = await getAuthContext(ctx);
    const out: Record<string, number> = {};
    if (!auth.tenantId || !readsFleet(auth)) return out;
    const tenantId = auth.tenantId;
    for (const raw of [...new Set(vehicleIds)].slice(0, IDS_CAP)) {
      const vehicleId = ctx.db.normalizeId("vehicles", raw);
      if (!vehicleId) continue;
      const rows = [
        ...(await ctx.db
          .query("vehicleFuelLogs")
          .withIndex("by_vehicleId", (q) => q.eq("vehicleId", vehicleId))
          .order("desc")
          .take(READING_ROWS)),
        ...(await ctx.db
          .query("vehicleServiceEntries")
          .withIndex("by_vehicleId", (q) => q.eq("vehicleId", vehicleId))
          .order("desc")
          .take(READING_ROWS)),
      ];
      for (const row of mineLive(rows, tenantId))
        out[raw] = Math.max(out[raw] ?? 0, Number(row.odometer));
    }
    return out;
  },
});

/**
 * The newest `limit` fuel and the newest `limit` service entries (by when
 * they were logged), how many of each the company has logged, and whether
 * older entries exist.
 */
export const vehicleLogPage = query({
  args: { limit: v.number() },
  handler: async (ctx, { limit }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      fuel: [] as Doc<"vehicleFuelLogs">[],
      service: [] as Doc<"vehicleServiceEntries">[],
      fuelCount: 0,
      serviceCount: 0,
      countsCapped: false,
      hasOlder: false,
    };
    if (!auth.tenantId || !readsFleet(auth)) return out;
    const tenantId = auth.tenantId;
    const take = Math.max(1, Math.min(limit, PAGE_CAP));
    const fuel = await ctx.db
      .query("vehicleFuelLogs")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .take(COUNT_CAP);
    const service = await ctx.db
      .query("vehicleServiceEntries")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .take(COUNT_CAP);
    const liveFuel = mineLive(fuel, tenantId).filter(
      (row) => row.loggedAt != null,
    );
    const liveService = mineLive(service, tenantId).filter(
      (row) => row.loggedAt != null,
    );
    out.fuelCount = liveFuel.length;
    out.serviceCount = liveService.length;
    out.countsCapped =
      fuel.length === COUNT_CAP || service.length === COUNT_CAP;
    out.fuel = liveFuel.slice(0, take);
    out.service = liveService.slice(0, take);
    out.hasOlder = liveFuel.length > take || liveService.length > take;
    return out;
  },
});

/**
 * One month's rental rows: equipment holds that overlap [from, to) or
 * belong to events that start in it, vendor rental lines of events that
 * start in it, and equipment problems raised in it.
 */
export const rentalMonth = query({
  args: { from: v.number(), to: v.number() },
  handler: async (ctx, { from, to }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      holds: [] as Doc<"equipmentReservations">[],
      lines: [] as Array<Doc<"rentalOrderLines"> & { missingQuantity: number }>,
      issues: [] as Doc<"equipmentIssues">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const readsHolds = canRead(auth, [
      "inventoryAccess",
      "logisticsAccess",
      "eventManageAccess",
    ]);
    const readsLines = canRead(auth, [
      "logisticsAccess",
      "inventoryAccess",
      "eventManageAccess",
    ]);
    const readsIssues = canRead(auth, [
      "inventoryAccess",
      "logisticsAccess",
      "eventManageAccess",
      "financeAccess",
    ]);
    if (readsHolds || readsLines) {
      const events = await ctx.db
        .query("events")
        .withIndex("by_tenantId_and_startsAt", (q) =>
          q
            .eq("tenantId", tenantId)
            .gte("startsAt", from - HOLD_REACH_MS)
            .lt("startsAt", to + HOLD_REACH_MS),
        )
        .collect();
      for (const event of events) {
        const starts =
          event.startsAt != null &&
          event.startsAt >= from &&
          event.startsAt < to;
        if (readsHolds)
          for (const hold of mineLive(
            await ctx.db
              .query("equipmentReservations")
              .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
              .collect(),
            tenantId,
          ))
            if (
              starts ||
              (hold.startsAt != null &&
                hold.endsAt != null &&
                hold.startsAt < to &&
                hold.endsAt > from)
            )
              out.holds.push(hold);
        if (readsLines && starts)
          for (const line of mineLive(
            await ctx.db
              .query("rentalOrderLines")
              .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
              .collect(),
            tenantId,
          ))
            out.lines.push({
              ...line,
              missingQuantity:
                line.deliveredQuantity != null &&
                line.returnedQuantity != null &&
                line.deliveredQuantity > line.returnedQuantity
                  ? line.deliveredQuantity - line.returnedQuantity
                  : 0,
            });
      }
    }
    // A problem is recorded when it is raised (or later), so the ones raised
    // in the month were made in it or after it.
    if (readsIssues)
      for (const issue of mineLive(
        await ctx.db
          .query("equipmentIssues")
          .withIndex("by_tenantId", (q) =>
            q.eq("tenantId", tenantId).gte("_creationTime", from - DAY_MS),
          )
          .collect(),
        tenantId,
      ))
        if (
          issue.raisedAt != null &&
          issue.raisedAt >= from &&
          issue.raisedAt < to
        )
          out.issues.push(issue);
    return out;
  },
});

/**
 * Leads that came through these lead sources (the ones linked to venues),
 * with the generated list's computed fields. Contact details are left out:
 * the venue screens do not show them.
 */
export const leadsForSources = query({
  args: { sourceIds: v.array(v.string()) },
  handler: async (ctx, { sourceIds }) => {
    const auth = await getAuthContext(ctx);
    const out: Array<
      Doc<"leads"> & { displayName: string; isClosed: boolean }
    > = [];
    if (!auth.tenantId || !canRead(auth, ["salesAccess"])) return out;
    const tenantId = auth.tenantId;
    for (const raw of [...new Set(sourceIds)].slice(0, IDS_CAP)) {
      const sourceId = ctx.db.normalizeId("referralSources", raw);
      if (!sourceId) continue;
      for (const row of mineLive(
        await ctx.db
          .query("leads")
          .withIndex("by_referralSourceId", (q) =>
            q.eq("referralSourceId", sourceId),
          )
          .collect(),
        tenantId,
      ))
        out.push({
          ...row,
          email: undefined,
          phone: undefined,
          displayName:
            row.leadType === "company"
              ? String(row.companyName)
              : `${row.givenName} ${row.familyName}`,
          isClosed: row.closedAt != null,
        });
    }
    return out;
  },
});

/** The notes of these venues (same visibility rule as listVenueNote). */
export const notesForVenues = query({
  args: { venueIds: v.array(v.string()) },
  handler: async (ctx, { venueIds }) => {
    const auth = await getAuthContext(ctx);
    const out: Doc<"venueNotes">[] = [];
    if (!auth.tenantId || !canRead(auth, ["eventAccess"])) return out;
    const tenantId = auth.tenantId;
    const manages = canRead(auth, ["manageAccess"]);
    for (const raw of [...new Set(venueIds)].slice(0, IDS_CAP)) {
      const venueId = ctx.db.normalizeId("venues", raw);
      if (!venueId) continue;
      for (const row of mineLive(
        await ctx.db
          .query("venueNotes")
          .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
          .collect(),
        tenantId,
      ))
        if (row.visibility !== "management_only" || manages) out.push(row);
    }
    return out;
  },
});

/** Every live event at this venue, as the light rows of convex/eventLookup.ts. */
export const venueEvents = query({
  args: { venueId: v.string() },
  handler: async (ctx, { venueId: raw }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return [];
    const tenantId = auth.tenantId;
    const venueId = ctx.db.normalizeId("venues", raw);
    if (!venueId) return [];
    return mineLive(
      await ctx.db
        .query("events")
        .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
        .collect(),
      tenantId,
    ).map((e): EventLookupRow => ({
      _id: e._id,
      title: e.title,
      stage: e.stage,
      eventType: e.eventType,
      startsAt: e.startsAt ?? null,
      endsAt: e.endsAt ?? null,
      venueId: e.venueId ?? null,
      venueName: e.venueName ?? null,
      clientId: e.clientId ?? null,
      expectedHeadcount: e.expectedHeadcount ?? null,
      serviceStyleId: e.serviceStyleId ?? null,
      occasionId: e.occasionId ?? null,
      eventNumber: e.eventNumber ?? null,
      deletedAt: e.deletedAt ?? null,
      quotedPrice: e.quotedPrice ?? null,
      assignedToId: e.assignedToId ?? null,
      referralSourceId: e.referralSourceId ?? null,
      serviceStyleName: e.serviceStyleName ?? null,
      budgetAmount: e.budgetAmount ?? null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    }));
  },
});
