// Logistics and facilities rows for the records a screen shows, read through
// their indexes: the rows of given events, pack lists by status, deliveries
// by status, open equipment issues, and the holds on given pieces. Those
// screens used to load each table whole (every row the company ever had),
// and on the live server those loads ran out of time.
//
// Same read rules and computed fields as the generated list queries in
// convex/queries.ts; a part this role may not read comes back empty, as
// those lists do.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { decrypt } from "./lib/encryption";
import type { EventLookupRow } from "./eventLookup";
import { canRead } from "./search";
import { openHoldsForEquipment } from "./lib/openEquipmentHolds";

export const LOGISTICS_EVENT_CAP = 1000;
const EQUIPMENT_CAP = 50;

type Live = { deletedAt?: number | null; tenantId: string };
const mineLive = <T extends Live>(rows: T[], tenantId: string) =>
  rows.filter((row) => row.deletedAt == null && row.tenantId === tenantId);

/** The generated lists' note decryption (queries.ts __decryptDoc). */
async function plainNotes<T extends { notes?: string | null }>(
  ctx: QueryCtx,
  entity: string,
  row: T,
): Promise<T> {
  const raw = row.notes;
  if (typeof raw !== "string") return row;
  let envelope: { v?: unknown; kid?: unknown; ct?: unknown } | null = null;
  try {
    envelope = JSON.parse(raw);
  } catch {
    return row;
  }
  if (
    !envelope ||
    typeof envelope !== "object" ||
    !("v" in envelope && "kid" in envelope && "ct" in envelope)
  )
    return row;
  if (envelope.v !== 1)
    throw new Error(
      `Unsupported Manifest encryption envelope version: ${String(envelope.v)}`,
    );
  return {
    ...row,
    notes: await decrypt(String(envelope.ct), String(envelope.kid), {
      ctx,
      entity,
      property: "notes",
    }),
  };
}

const withSurplus = (line: Doc<"packListItems">) => ({
  ...line,
  surplusQuantity: Math.max(
    0,
    Number(line.packedQuantity) - Number(line.requiredQuantity),
  ),
});

const withRigFlags = (row: Doc<"eventVehicleAssignments">) => ({
  ...row,
  isPreloaded: row.preloadedAt != null,
  isReleased: row.releasedAt != null,
});

const withPassed = (row: Doc<"vehicleTripChecks">) => ({
  ...row,
  passed:
    row.tires !== "fail" &&
    row.brakes !== "fail" &&
    row.lights !== "fail" &&
    row.fluids !== "fail" &&
    row.bodywork !== "fail" &&
    row.interior !== "fail" &&
    (row.refrigeration == null || row.refrigeration !== "fail"),
});

const PART = v.union(
  v.literal("packLists"),
  v.literal("packLines"),
  v.literal("rigs"),
  v.literal("tripChecks"),
  v.literal("reservations"),
  v.literal("deliveries"),
  v.literal("departureOverrides"),
  v.literal("assignments"),
  v.literal("staffNeeds"),
  v.literal("issues"),
);

/**
 * The asked-for rows of these events. Pack lines and trip checks hang off
 * the event's pack lists and trucks, so they are read through those.
 */
export const forEvents = query({
  args: { eventIds: v.array(v.string()), parts: v.array(PART) },
  handler: async (ctx, { eventIds, parts }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      packLists: [] as Doc<"packLists">[],
      packLines: [] as ReturnType<typeof withSurplus>[],
      rigs: [] as ReturnType<typeof withRigFlags>[],
      tripChecks: [] as ReturnType<typeof withPassed>[],
      reservations: [] as Doc<"equipmentReservations">[],
      deliveries: [] as Doc<"deliveries">[],
      departureOverrides: [] as Doc<"departureOverrides">[],
      assignments: [] as Doc<"eventAssignments">[],
      staffNeeds: [] as Doc<"eventStaffNeeds">[],
      issues: [] as Doc<"equipmentIssues">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const want = new Set(parts);
    const ids: Id<"events">[] = [];
    for (const raw of [...new Set(eventIds)].slice(0, LOGISTICS_EVENT_CAP)) {
      const id = ctx.db.normalizeId("events", raw);
      if (id) ids.push(id);
    }
    const readsStaff = canRead(auth, ["staffAccess"]);
    const readsWorkforce = canRead(auth, [
      "workforceAccess",
      "workforceSelfAccess",
    ]);
    const readsHolds = canRead(auth, [
      "inventoryAccess",
      "logisticsAccess",
      "eventManageAccess",
    ]);
    const readsDeliveries = canRead(auth, ["logisticsAccess", "manageAccess"]);
    const readsIssues = canRead(auth, [
      "inventoryAccess",
      "logisticsAccess",
      "eventManageAccess",
      "financeAccess",
    ]);

    for (const eventId of ids) {
      if (readsStaff && (want.has("packLists") || want.has("packLines"))) {
        const lists = mineLive(
          await ctx.db
            .query("packLists")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        );
        for (const list of lists) {
          if (want.has("packLists"))
            out.packLists.push(await plainNotes(ctx, "PackList", list));
          if (want.has("packLines"))
            for (const line of mineLive(
              await ctx.db
                .query("packListItems")
                .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
                .collect(),
              tenantId,
            ))
              out.packLines.push(withSurplus(line));
        }
      }
      if (readsStaff && (want.has("rigs") || want.has("tripChecks"))) {
        const rigs = mineLive(
          await ctx.db
            .query("eventVehicleAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        );
        for (const rig of rigs) {
          if (want.has("rigs")) out.rigs.push(withRigFlags(rig));
          if (want.has("tripChecks"))
            for (const check of mineLive(
              await ctx.db
                .query("vehicleTripChecks")
                .withIndex("by_eventVehicleAssignmentId", (q) =>
                  q.eq("eventVehicleAssignmentId", rig._id),
                )
                .collect(),
              tenantId,
            ))
              out.tripChecks.push(withPassed(check));
        }
      }
      if (readsStaff && want.has("departureOverrides"))
        out.departureOverrides.push(
          ...mineLive(
            await ctx.db
              .query("departureOverrides")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
      if (readsHolds && want.has("reservations"))
        out.reservations.push(
          ...mineLive(
            await ctx.db
              .query("equipmentReservations")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
      if (readsDeliveries && want.has("deliveries"))
        for (const row of mineLive(
          await ctx.db
            .query("deliveries")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        ))
          out.deliveries.push(await plainNotes(ctx, "Delivery", row));
      if (readsWorkforce && want.has("assignments"))
        for (const row of mineLive(
          await ctx.db
            .query("eventAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        ))
          out.assignments.push(await plainNotes(ctx, "EventAssignment", row));
      if (readsWorkforce && want.has("staffNeeds"))
        out.staffNeeds.push(
          ...mineLive(
            await ctx.db
              .query("eventStaffNeeds")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
      if (readsIssues && want.has("issues"))
        out.issues.push(
          ...mineLive(
            await ctx.db
              .query("equipmentIssues")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
    }
    return out;
  },
});

const PACK_STATUS = v.union(
  v.literal("draft"),
  v.literal("packing"),
  v.literal("packed"),
  v.literal("loaded"),
  v.literal("dispatched"),
  v.literal("cancelled"),
);

/** Pack lists in these statuses, with their lines when asked. */
export const packListsByStatus = query({
  args: { statuses: v.array(PACK_STATUS), withLines: v.boolean() },
  handler: async (ctx, { statuses, withLines }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      packLists: [] as Doc<"packLists">[],
      packLines: [] as ReturnType<typeof withSurplus>[],
    };
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return out;
    const tenantId = auth.tenantId;
    for (const status of [...new Set(statuses)]) {
      const lists = mineLive(
        await ctx.db
          .query("packLists")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", status),
          )
          .collect(),
        tenantId,
      );
      for (const list of lists) {
        out.packLists.push(await plainNotes(ctx, "PackList", list));
        if (withLines)
          for (const line of mineLive(
            await ctx.db
              .query("packListItems")
              .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
              .collect(),
            tenantId,
          ))
            out.packLines.push(withSurplus(line));
      }
    }
    return out;
  },
});

const DELIVERY_STATUS = v.union(
  v.literal("scheduled"),
  v.literal("in_transit"),
  v.literal("delivered"),
  v.literal("failed"),
  v.literal("cancelled"),
);

/** Deliveries in these statuses. */
export const deliveriesByStatus = query({
  args: { statuses: v.array(DELIVERY_STATUS) },
  handler: async (ctx, { statuses }) => {
    const auth = await getAuthContext(ctx);
    const out: Doc<"deliveries">[] = [];
    if (!auth.tenantId || !canRead(auth, ["logisticsAccess", "manageAccess"]))
      return out;
    const tenantId = auth.tenantId;
    for (const status of [...new Set(statuses)])
      for (const row of mineLive(
        await ctx.db
          .query("deliveries")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", status),
          )
          .collect(),
        tenantId,
      ))
        out.push(await plainNotes(ctx, "Delivery", row));
    return out;
  },
});

/** Equipment issues still open. */
export const openEquipmentIssues = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (
      !auth.tenantId ||
      !canRead(auth, [
        "inventoryAccess",
        "logisticsAccess",
        "eventManageAccess",
        "financeAccess",
      ])
    )
      return [];
    const tenantId = auth.tenantId;
    return mineLive(
      await ctx.db
        .query("equipmentIssues")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", "open"),
        )
        .collect(),
      tenantId,
    );
  },
});

/** Every hold on these pieces (at most 50 pieces), for a scan lookup. */
export const holdsForEquipment = query({
  args: { equipmentIds: v.array(v.string()) },
  handler: async (ctx, { equipmentIds }) => {
    const auth = await getAuthContext(ctx);
    if (
      !auth.tenantId ||
      !canRead(auth, [
        "inventoryAccess",
        "logisticsAccess",
        "eventManageAccess",
      ])
    )
      return [];
    const tenantId = auth.tenantId;
    const out: Doc<"equipmentReservations">[] = [];
    for (const raw of [...new Set(equipmentIds)].slice(0, EQUIPMENT_CAP)) {
      const id = ctx.db.normalizeId("equipments", raw);
      if (!id) continue;
      out.push(...mineLive(await openHoldsForEquipment(ctx, id), tenantId));
    }
    return out;
  },
});

/** The company's pack lists, newest first, a page at a time. */
export const packListPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"]))
      return { page: [], isDone: true, continueCursor: "" };
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("packLists")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return {
      ...result,
      page: await Promise.all(
        mineLive(result.page, tenantId).map((row) =>
          plainNotes(ctx, "PackList", row),
        ),
      ),
    };
  },
});

const VENUE_CAP = 200;

/**
 * Live events at these venues (at most 200 venues) that start on or after
 * `from`, as the light rows of convex/eventLookup.ts.
 */
export const venueEventsSince = query({
  args: { venueIds: v.array(v.string()), from: v.number() },
  handler: async (ctx, { venueIds, from }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return [];
    const tenantId = auth.tenantId;
    const out: EventLookupRow[] = [];
    for (const raw of [...new Set(venueIds)].slice(0, VENUE_CAP)) {
      const venueId = ctx.db.normalizeId("venues", raw);
      if (!venueId) continue;
      for (const e of mineLive(
        await ctx.db
          .query("events")
          .withIndex("by_venueId", (q) => q.eq("venueId", venueId))
          .collect(),
        tenantId,
      ))
        if (typeof e.startsAt === "number" && e.startsAt >= from)
          // The light row of convex/eventLookup.ts.
          out.push({
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
          });
    }
    return out;
  },
});

/**
 * The purchase needs and ingredient demands one vendor order fills: needs
 * on its lines or on the demands its lines are linked to, and those linked
 * demands.
 */
export const vendorOrderNeeds = query({
  args: { vendorOrderId: v.string() },
  handler: async (ctx, { vendorOrderId }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      needs: [] as Doc<"purchaseNeeds">[],
      demands: [] as Doc<"ingredientDemands">[],
    };
    const orderId = ctx.db.normalizeId("vendorOrders", vendorOrderId);
    if (!auth.tenantId || !orderId) return out;
    if (!canRead(auth, ["inventoryAccess", "manageAccess"])) return out;
    const tenantId = auth.tenantId;
    const lines = mineLive(
      await ctx.db
        .query("vendorOrderLines")
        .withIndex("by_vendorOrderId", (q) => q.eq("vendorOrderId", orderId))
        .collect(),
      tenantId,
    );
    const links = mineLive(
      await ctx.db
        .query("vendorOrderLineDemands")
        .withIndex("by_vendorOrderId", (q) => q.eq("vendorOrderId", orderId))
        .collect(),
      tenantId,
    );
    const seen = new Set<string>();
    const add = (rows: Doc<"purchaseNeeds">[]) => {
      for (const row of mineLive(rows, tenantId))
        if (!seen.has(row._id)) {
          seen.add(row._id);
          out.needs.push(row);
        }
    };
    for (const line of lines)
      add(
        await ctx.db
          .query("purchaseNeeds")
          .withIndex("by_vendorOrderLineId", (q) =>
            q.eq("vendorOrderLineId", line._id),
          )
          .collect(),
      );
    const demandIds = [
      ...new Set(links.map((link) => link.ingredientDemandId)),
    ];
    for (const demandId of demandIds) {
      add(
        await ctx.db
          .query("purchaseNeeds")
          .withIndex("by_ingredientDemandId", (q) =>
            q.eq("ingredientDemandId", demandId),
          )
          .collect(),
      );
      const demand = await ctx.db.get(demandId);
      if (demand && demand.tenantId === tenantId && demand.deletedAt == null)
        out.demands.push(demand);
    }
    return out;
  },
});
