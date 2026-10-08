// Supply rows for what a screen shows: one page of a ledger (newest first),
// the rows of given events, dishes, demands, lots or count sheets, and small
// totals for the rows on screen. Those screens used to load each table whole
// (every row the company ever had), which ran out of time on the live server.
//
// Same read rules and computed fields as the generated list queries in
// convex/queries.ts; a part this role may not read comes back empty, as
// those lists do.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

const DAY = 86_400_000;
const ID_CAP = 1000;

type Live = { deletedAt?: number | null; tenantId: string };
const mineLive = <T extends Live>(rows: T[], tenantId: string) =>
  rows.filter((row) => row.deletedAt == null && row.tenantId === tenantId);
const empty = { page: [], isDone: true, continueCursor: "" };

const READS = {
  demand: ["inventoryAccess", "manageAccess"],
  need: ["inventoryAccess", "manageAccess"],
  order: ["procurementAccess", "manageAccess"],
  priceObservation: ["kitchenAccess", "procurementAccess", "manageAccess"],
  reservation: ["inventoryAccess", "eventManageAccess"],
  lot: ["inventoryAccess", "procurementAccess", "manageAccess"],
  transfer: ["inventoryAccess"],
  count: ["inventoryAccess"],
  openingStock: ["inventoryAccess", "manageAccess"],
  waste: ["inventoryAccess"],
  event: ["staffAccess"],
} as const;

/** The generated VendorOrderLine computed fields. */
const lineFields = (line: Doc<"vendorOrderLines">) => ({
  ...line,
  lineTotal: Number(line.orderedQuantity) * Number(line.unitCost),
  remainingQuantity:
    Number(line.orderedQuantity) - Number(line.receivedQuantity),
  isFullyReceived:
    Number(line.orderedQuantity) > 0 &&
    Number(line.receivedQuantity) >= Number(line.orderedQuantity),
  hasReceivingDiscrepancy:
    line.discrepancyQuantity != null && Number(line.discrepancyQuantity) > 0,
});

const normalIds = <T extends string>(
  normalize: (raw: string) => T | null,
  raws: readonly string[],
): T[] => {
  const out: T[] = [];
  for (const raw of [...new Set(raws)].slice(0, ID_CAP)) {
    const id = normalize(raw);
    if (id) out.push(id);
  }
  return out;
};

/** The ingredient demands and purchase needs of these events. */
export const demandsForEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      demands: [] as Doc<"ingredientDemands">[],
      needs: [] as Doc<"purchaseNeeds">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const ids = normalIds((raw) => ctx.db.normalizeId("events", raw), eventIds);
    for (const eventId of ids) {
      if (canRead(auth, READS.demand))
        out.demands.push(
          ...mineLive(
            await ctx.db
              .query("ingredientDemands")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
      if (canRead(auth, READS.need))
        out.needs.push(
          ...mineLive(
            await ctx.db
              .query("purchaseNeeds")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
    }
    return out;
  },
});

/**
 * Committed demand of these dishes (at most 200), the history a demand
 * anomaly compares against, with the head counts of their events.
 */
export const demandHistory = query({
  args: { dishIds: v.array(v.string()) },
  handler: async (ctx, { dishIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      demands: [] as Doc<"ingredientDemands">[],
      events: [] as Array<
        Pick<Doc<"events">, "_id" | "deletedAt" | "expectedHeadcount">
      >,
    };
    if (!auth.tenantId || !canRead(auth, READS.demand)) return out;
    const tenantId = auth.tenantId;
    const seen = new Set<string>();
    for (const raw of [...new Set(dishIds)].slice(0, 200)) {
      const dishId = ctx.db.normalizeId("dishes", raw);
      if (!dishId) continue;
      for (const row of mineLive(
        await ctx.db
          .query("ingredientDemands")
          .withIndex("by_dishId", (q) => q.eq("dishId", dishId))
          .collect(),
        tenantId,
      )) {
        if (row.status !== "confirmed" && row.status !== "fulfilled") continue;
        out.demands.push(row);
        if (seen.has(row.eventId)) continue;
        seen.add(row.eventId);
        const event = await ctx.db.get(row.eventId);
        if (event && event.tenantId === tenantId)
          out.events.push({
            _id: event._id,
            deletedAt: event.deletedAt,
            expectedHeadcount: event.expectedHeadcount,
          });
      }
    }
    return out;
  },
});

/**
 * Ingredient demand of past events in the given windows (the quarters a
 * seasonal forecast averages), with those events' dates. At most 3000
 * events per window.
 */
export const demandInWindows = query({
  args: { windows: v.array(v.object({ from: v.number(), to: v.number() })) },
  handler: async (ctx, { windows }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      demands: [] as Doc<"ingredientDemands">[],
      events: [] as Array<
        Pick<Doc<"events">, "_id" | "startsAt" | "deletedAt">
      >,
    };
    if (
      !auth.tenantId ||
      !canRead(auth, READS.demand) ||
      !canRead(auth, READS.event)
    )
      return out;
    const tenantId = auth.tenantId;
    for (const { from, to } of windows.slice(0, 5)) {
      const events = (
        await ctx.db
          .query("events")
          .withIndex("by_tenantId_and_startsAt", (q) =>
            q.eq("tenantId", tenantId).gte("startsAt", from).lt("startsAt", to),
          )
          .take(3000)
      ).filter((event) => event.deletedAt == null);
      for (const event of events) {
        out.events.push({
          _id: event._id,
          startsAt: event.startsAt,
          deletedAt: event.deletedAt,
        });
        out.demands.push(
          ...mineLive(
            await ctx.db
              .query("ingredientDemands")
              .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
              .collect(),
            tenantId,
          ),
        );
      }
    }
    return out;
  },
});

/** Purchase needs, newest first, a page at a time (one event's when given). */
export const needPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    eventId: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, eventId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.need)) return empty;
    const tenantId = auth.tenantId;
    const event = eventId ? ctx.db.normalizeId("events", eventId) : null;
    if (eventId && !event) return empty;
    const result = event
      ? await ctx.db
          .query("purchaseNeeds")
          .withIndex("by_eventId", (q) => q.eq("eventId", event))
          .order("desc")
          .paginate(paginationOpts)
      : await ctx.db
          .query("purchaseNeeds")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .order("desc")
          .paginate(paginationOpts);
    return { ...result, page: mineLive(result.page, tenantId) };
  },
});

/**
 * Vendor orders, newest first, a page at a time, each with its lines and
 * live total (as the generated order list paints them).
 */
export const orderPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.order)) return empty;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("vendorOrders")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    const page = [];
    for (const order of mineLive(result.page, tenantId)) {
      const lines = await ctx.db
        .query("vendorOrderLines")
        .withIndex("by_vendorOrderId", (q) => q.eq("vendorOrderId", order._id))
        .collect();
      page.push({
        ...order,
        lines,
        liveTotalAmount:
          lines.reduce(
            (sum, line) =>
              sum +
              (line.deletedAt == null && line.lineTotalAmount != null
                ? Number(line.lineTotalAmount)
                : 0),
            0,
          ) +
          Number(order.taxAmount) +
          Number(order.shippingAmount),
      });
    }
    return { ...result, page };
  },
});

/**
 * The order lines that fill these demands (directly or through a demand
 * link), those links, and the orders of those lines.
 */
export const linesForDemands = query({
  args: { demandIds: v.array(v.string()) },
  handler: async (ctx, { demandIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      lines: [] as ReturnType<typeof lineFields>[],
      links: [] as Doc<"vendorOrderLineDemands">[],
      orders: [] as Doc<"vendorOrders">[],
    };
    if (!auth.tenantId || !canRead(auth, READS.order)) return out;
    const tenantId = auth.tenantId;
    const lineIds = new Set<string>();
    const orderIds = new Set<string>();
    const addLine = async (line: Doc<"vendorOrderLines"> | null) => {
      if (!line || line.tenantId !== tenantId || line.deletedAt != null) return;
      if (lineIds.has(line._id)) return;
      lineIds.add(line._id);
      out.lines.push(lineFields(line));
      if (orderIds.has(line.vendorOrderId)) return;
      orderIds.add(line.vendorOrderId);
      const order = await ctx.db.get(line.vendorOrderId);
      if (order && order.tenantId === tenantId && order.deletedAt == null)
        out.orders.push(order);
    };
    const ids = normalIds(
      (raw) => ctx.db.normalizeId("ingredientDemands", raw),
      demandIds,
    );
    for (const demandId of ids) {
      for (const line of await ctx.db
        .query("vendorOrderLines")
        .withIndex("by_ingredientDemandId", (q) =>
          q.eq("ingredientDemandId", demandId),
        )
        .collect())
        await addLine(line);
      for (const link of mineLive(
        await ctx.db
          .query("vendorOrderLineDemands")
          .withIndex("by_ingredientDemandId", (q) =>
            q.eq("ingredientDemandId", demandId),
          )
          .collect(),
        tenantId,
      )) {
        out.links.push(link);
        await addLine(await ctx.db.get(link.vendorOrderLineId));
      }
    }
    return out;
  },
});

const SENT = ["submitted", "confirmed", "partially_received"] as const;

/** Orders already sent (still changeable) and the needs they were sent for. */
export const sentOrderNeeds = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const out = {
      orders: [] as Doc<"vendorOrders">[],
      needs: [] as Doc<"purchaseNeeds">[],
    };
    if (!auth.tenantId || !canRead(auth, READS.order)) return out;
    const tenantId = auth.tenantId;
    const readsNeeds = canRead(auth, READS.need);
    for (const status of SENT)
      for (const order of mineLive(
        await ctx.db
          .query("vendorOrders")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", status),
          )
          .collect(),
        tenantId,
      )) {
        out.orders.push(order);
        if (readsNeeds)
          out.needs.push(
            ...mineLive(
              await ctx.db
                .query("purchaseNeeds")
                .withIndex("by_vendorOrderId", (q) =>
                  q.eq("vendorOrderId", order._id),
                )
                .collect(),
              tenantId,
            ),
          );
      }
    return out;
  },
});

/**
 * What vendor scores count over their rolling window: orders received since
 * `from`, their lines, and price observations taken since `from`.
 * Observations are read newest first back to `from - 30 days` (an
 * observation is saved when it is taken; a bulk import may save older ones
 * a little late).
 */
export const vendorScoreInputs = query({
  args: { from: v.number() },
  handler: async (ctx, { from }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      orders: [] as Doc<"vendorOrders">[],
      lines: [] as Doc<"vendorOrderLines">[],
      observations: [] as Doc<"ingredientPriceObservations">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    if (canRead(auth, READS.order))
      for (const order of mineLive(
        await ctx.db
          .query("vendorOrders")
          .withIndex("by_tenantId_and_status", (q) =>
            q.eq("tenantId", tenantId).eq("status", "received"),
          )
          .collect(),
        tenantId,
      )) {
        if (order.receivedAt == null || order.receivedAt < from) continue;
        out.orders.push(order);
        out.lines.push(
          ...(await ctx.db
            .query("vendorOrderLines")
            .withIndex("by_vendorOrderId", (q) =>
              q.eq("vendorOrderId", order._id),
            )
            .collect()),
        );
      }
    if (canRead(auth, READS.priceObservation))
      out.observations = mineLive(
        await ctx.db
          .query("ingredientPriceObservations")
          .withIndex("by_tenantId", (q) =>
            q.eq("tenantId", tenantId).gte("_creationTime", from - 30 * DAY),
          )
          .collect(),
        tenantId,
      ).filter((row) => (row.observedAt ?? row.createdAt ?? 0) >= from);
    return out;
  },
});

/** Stock reservations, newest first, a page at a time. */
export const reservationPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.reservation)) return empty;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("inventoryReservations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: mineLive(result.page, tenantId) };
  },
});

/** Stock transfers, newest first, a page at a time. */
export const transferPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.transfer)) return empty;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("stockTransfers")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: mineLive(result.page, tenantId) };
  },
});

/**
 * Lots for a recall trace: lot numbers that start with `lotNumber` (as
 * typed and in capitals), and/or lots received in [receivedFrom,
 * receivedTo]. A date-only search reads lots saved from 30 days before the
 * range to 30 days after it. Returns the matching lots, every consumption
 * from them, and the count of consumptions with no lot.
 */
export const traceLots = query({
  args: {
    lotNumber: v.string(),
    receivedFrom: v.union(v.number(), v.null()),
    receivedTo: v.union(v.number(), v.null()),
  },
  handler: async (ctx, { lotNumber, receivedFrom, receivedTo }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      lots: [] as Doc<"inventoryLots">[],
      reservations: [] as Doc<"inventoryReservations">[],
      unattributed: 0,
    };
    if (!auth.tenantId || !canRead(auth, READS.lot)) return out;
    const tenantId = auth.tenantId;
    const typed = lotNumber.trim();
    let lots: Doc<"inventoryLots">[] = [];
    if (typed) {
      const seen = new Set<string>();
      for (const prefix of [...new Set([typed, typed.toUpperCase()])])
        for (const lot of await ctx.db
          .query("inventoryLots")
          .withIndex("by_supplierLotNumber", (q) =>
            q
              .gte("supplierLotNumber", prefix)
              .lt("supplierLotNumber", `${prefix}￿`),
          )
          .take(500))
          if (!seen.has(lot._id)) {
            seen.add(lot._id);
            lots.push(lot);
          }
    } else if (receivedFrom != null || receivedTo != null) {
      lots = await ctx.db
        .query("inventoryLots")
        .withIndex("by_tenantId", (q) => {
          const tenant = q.eq("tenantId", tenantId);
          const lower =
            receivedFrom == null
              ? tenant
              : tenant.gte("_creationTime", receivedFrom - 30 * DAY);
          return receivedTo == null
            ? lower
            : lower.lte("_creationTime", receivedTo + 30 * DAY);
        })
        .take(5000);
    }
    out.lots = mineLive(lots, tenantId).filter(
      (lot) =>
        (receivedFrom == null ||
          (lot.receivedAt != null && Number(lot.receivedAt) >= receivedFrom)) &&
        (receivedTo == null ||
          (lot.receivedAt != null && Number(lot.receivedAt) <= receivedTo)),
    );
    if (!canRead(auth, READS.reservation)) return out;
    for (const lot of out.lots)
      out.reservations.push(
        ...mineLive(
          await ctx.db
            .query("inventoryReservations")
            .withIndex("by_inventoryLotId", (q) =>
              q.eq("inventoryLotId", lot._id),
            )
            .collect(),
          tenantId,
        ),
      );
    if (!typed)
      out.unattributed = mineLive(
        await ctx.db
          .query("inventoryReservations")
          .withIndex("by_inventoryLotId", (q) =>
            q.eq("inventoryLotId", undefined),
          )
          .collect(),
        tenantId,
      ).filter(
        (row) => row.status === "consumed" && row.consumedAt != null,
      ).length;
    return out;
  },
});

/** Count sheets, newest first, a page at a time. */
export const countSessionPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.count)) return empty;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("stockCountSessions")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: mineLive(result.page, tenantId) };
  },
});

/** How many lines of each of these count sheets are reconciled. */
export const countSessionProgress = query({
  args: { sessionIds: v.array(v.string()) },
  handler: async (ctx, { sessionIds }) => {
    const auth = await getAuthContext(ctx);
    const out: Record<string, number> = {};
    if (!auth.tenantId || !canRead(auth, READS.count)) return out;
    const tenantId = auth.tenantId;
    const ids = normalIds(
      (raw) => ctx.db.normalizeId("stockCountSessions", raw),
      sessionIds,
    );
    for (const sessionId of ids)
      out[sessionId] = mineLive(
        await ctx.db
          .query("stockCountLines")
          .withIndex("by_stockCountSessionId", (q) =>
            q.eq("stockCountSessionId", sessionId),
          )
          .collect(),
        tenantId,
      ).filter((line) => line.status === "reconciled").length;
    return out;
  },
});

const OPENING_TABS = {
  needs_review: ["needs_review"],
  ready: ["ready"],
  done: ["applied", "set_aside"],
} as const;
const OPENING_TAB = v.union(
  v.literal("needs_review"),
  v.literal("ready"),
  v.literal("done"),
);

/** Opening stock records of one tab, a page at a time. */
export const openingStockPage = query({
  args: { paginationOpts: paginationOptsValidator, tab: OPENING_TAB },
  handler: async (ctx, { paginationOpts, tab }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.openingStock)) return empty;
    const tenantId = auth.tenantId;
    const statuses: readonly string[] = OPENING_TABS[tab];
    const result = await ctx.db
      .query("openingStockRecords")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .filter((q) =>
        q.or(...statuses.map((status) => q.eq(q.field("status"), status))),
      )
      .paginate(paginationOpts);
    return {
      ...result,
      page: mineLive(result.page, tenantId).map((row) => ({
        ...row,
        isOpen: row.status === "needs_review" || row.status === "ready",
      })),
    };
  },
});

/** How many opening stock records are in each tab. */
export const openingStockCounts = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    const out = { needs_review: 0, ready: 0, done: 0 };
    if (!auth.tenantId || !canRead(auth, READS.openingStock)) return out;
    const tenantId = auth.tenantId;
    for (const row of mineLive(
      await ctx.db
        .query("openingStockRecords")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      tenantId,
    )) {
      if (row.status === "needs_review") out.needs_review += 1;
      else if (row.status === "ready") out.ready += 1;
      else if (row.status === "applied" || row.status === "set_aside")
        out.done += 1;
    }
    return out;
  },
});

const withCost = (row: Doc<"wasteRecords">) => ({
  ...row,
  costImpact: Number(row.quantity) * Number(row.unitCost),
});

/**
 * Waste recorded since `from`. Records are read newest first back to
 * `from - 7 days` (a record is saved when it is logged, and may be dated a
 * few days back).
 */
export const wasteSince = query({
  args: { from: v.number() },
  handler: async (ctx, { from }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.waste)) return [];
    const tenantId = auth.tenantId;
    return mineLive(
      await ctx.db
        .query("wasteRecords")
        .withIndex("by_tenantId", (q) =>
          q.eq("tenantId", tenantId).gte("_creationTime", from - 7 * DAY),
        )
        .collect(),
      tenantId,
    ).map(withCost);
  },
});

/** Every waste record, a page at a time (the all-time report). */
export const wastePage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, READS.waste)) return empty;
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("wasteRecords")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: mineLive(result.page, tenantId).map(withCost) };
  },
});
