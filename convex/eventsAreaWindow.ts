// The rows the event screens need, read through indexes for the events (or
// the one event) on screen. These screens used to load whole tables (every
// row the company ever had) and filter in the browser; on the live server
// those loads ran out of time.
//
// Each section keeps the read rule of its generated list query
// (convex/queries.ts); a section this role may not read comes back empty, as
// that list does. Encrypted fields the screens do not show are left out.
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

/** Board screens read at most this many events. */
export const AREA_EVENT_CAP = 2000;

const live = <T extends { deletedAt?: unknown; tenantId: string }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.deletedAt == null && row.tenantId === tenantId);

function eventIdsOf(ctx: QueryCtx, raw: string[]): Id<"events">[] {
  const ids: Id<"events">[] = [];
  for (const value of [...new Set(raw)].slice(0, AREA_EVENT_CAP)) {
    const id = ctx.db.normalizeId("events", value);
    if (id) ids.push(id);
  }
  return ids;
}

/** Guests of these events, only what the capacity planner counts. */
export const guestsForEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const out: { eventId: string; rsvpStatus: string; deletedAt: null }[] = [];
    if (!auth.tenantId || !canRead(auth, ["eventAccess"])) return out;
    for (const eventId of eventIdsOf(ctx, eventIds)) {
      const rows = await ctx.db
        .query("eventGuests")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect();
      for (const row of live(rows, auth.tenantId))
        out.push({
          eventId: row.eventId,
          rsvpStatus: String(row.rsvpStatus),
          deletedAt: null,
        });
    }
    return out;
  },
});

/** Invoices of these events (tracker numbers). */
export const invoicesForEvents = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const out: Doc<"invoices">[] = [];
    if (!auth.tenantId || !canRead(auth, ["financeAccess", "manageAccess"]))
      return out;
    for (const eventId of eventIdsOf(ctx, eventIds))
      out.push(
        ...live(
          await ctx.db
            .query("invoices")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          auth.tenantId,
        ),
      );
    return out;
  },
});

/** Deliveries, invoices, trucks and given numbers of the tracker's events. */
export const trackerRows = query({
  args: { eventIds: v.array(v.string()) },
  handler: async (ctx, { eventIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      deliveries: [] as Doc<"deliveries">[],
      invoices: [] as Doc<"invoices">[],
      vehicleAssignments: [] as Array<
        Doc<"eventVehicleAssignments"> & {
          isPreloaded: boolean;
          isReleased: boolean;
        }
      >,
      numberAssignments: [] as Doc<"eventNumberAssignments">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const seesDeliveries = canRead(auth, ["logisticsAccess", "manageAccess"]);
    const seesInvoices = canRead(auth, ["financeAccess", "manageAccess"]);
    const seesStaff = canRead(auth, ["staffAccess"]);
    for (const eventId of eventIdsOf(ctx, eventIds)) {
      if (seesDeliveries)
        for (const row of live(
          await ctx.db
            .query("deliveries")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        ))
          // Delivery notes are encrypted and the tracker does not show them.
          out.deliveries.push({ ...row, notes: undefined });
      if (seesInvoices)
        out.invoices.push(
          ...live(
            await ctx.db
              .query("invoices")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
      if (seesStaff) {
        for (const rig of live(
          await ctx.db
            .query("eventVehicleAssignments")
            .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
            .collect(),
          tenantId,
        ))
          out.vehicleAssignments.push({
            ...rig,
            isPreloaded: rig.preloadedAt != null,
            isReleased: rig.releasedAt != null,
          });
        out.numberAssignments.push(
          ...live(
            await ctx.db
              .query("eventNumberAssignments")
              .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
              .collect(),
            tenantId,
          ),
        );
      }
    }
    return out;
  },
});

/**
 * Shifts that overlap [from, to): of these people when personIds is given
 * (a shift that starts in the window with no end time counts too), else of
 * everyone through the endsAt index (open-ended shifts cannot overlap).
 * Row rule as listShift: workforce access, or self access to your own shifts
 * and event shifts. Encrypted notes are left out.
 */
export const shiftsInWindow = query({
  args: {
    from: v.number(),
    to: v.number(),
    personIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { from, to, personIds }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const tenantId = auth.tenantId;
    const full = canRead(auth, ["workforceAccess"]);
    const self = canRead(auth, ["workforceSelfAccess"]);
    if (!full && !self) return [];
    let rows: Doc<"shifts">[] = [];
    if (personIds) {
      for (const raw of [...new Set(personIds)]) {
        const personId = ctx.db.normalizeId("people", raw);
        if (!personId) continue;
        rows.push(
          ...(await ctx.db
            .query("shifts")
            .withIndex("by_personId", (q) => q.eq("personId", personId))
            .collect()),
        );
      }
    } else {
      rows = await ctx.db
        .query("shifts")
        .withIndex("by_tenantId_and_endsAt", (q) =>
          q.eq("tenantId", tenantId).gt("endsAt", from),
        )
        .collect();
    }
    return live(rows, tenantId)
      .filter(
        (row) =>
          row.startsAt != null &&
          row.startsAt < to &&
          (row.endsAt != null ? row.endsAt > from : row.startsAt >= from),
      )
      .filter(
        (row) =>
          full ||
          (auth.personId != null && row.personId === auth.personId) ||
          row.eventId != null,
      )
      .map((row) => ({ ...row, notes: undefined }));
  },
});

/** Waitlist entries of one event's staff needs. */
export const waitlistForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const out: Doc<"staffNeedWaitlistEntries">[] = [];
    if (
      !auth.tenantId ||
      !canRead(auth, ["workforceAccess", "workforceSelfAccess"])
    )
      return out;
    const needs = await ctx.db
      .query("eventStaffNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    for (const need of needs) {
      if (need.tenantId !== auth.tenantId) continue;
      out.push(
        ...live(
          await ctx.db
            .query("staffNeedWaitlistEntries")
            .withIndex("by_staffNeedId", (q) => q.eq("staffNeedId", need._id))
            .collect(),
          auth.tenantId,
        ),
      );
    }
    return out;
  },
});

/** Pack list lines of one event's pack lists. */
export const packItemsForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const out: Array<Doc<"packListItems"> & { surplusQuantity: number }> = [];
    if (!auth.tenantId || !canRead(auth, ["staffAccess"])) return out;
    const lists = await ctx.db
      .query("packLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect();
    for (const list of lists) {
      if (list.tenantId !== auth.tenantId) continue;
      for (const line of live(
        await ctx.db
          .query("packListItems")
          .withIndex("by_packListId", (q) => q.eq("packListId", list._id))
          .collect(),
        auth.tenantId,
      ))
        out.push({
          ...line,
          surplusQuantity: Math.max(
            0,
            Number(line.packedQuantity) - Number(line.requiredQuantity),
          ),
        });
    }
    return out;
  },
});

/**
 * One event's ingredient needs and the purchasing tied to them: the order
 * lines and line links of those needs, and the orders those lines sit on.
 */
export const purchasingForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      demands: [] as Doc<"ingredientDemands">[],
      orders: [] as Doc<"vendorOrders">[],
      lines: [] as Array<
        Doc<"vendorOrderLines"> & {
          lineTotal: number;
          remainingQuantity: number;
          isFullyReceived: boolean;
          hasReceivingDiscrepancy: boolean;
        }
      >,
      lineDemands: [] as Doc<"vendorOrderLineDemands">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const demands = live(
      await ctx.db
        .query("ingredientDemands")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      tenantId,
    );
    if (canRead(auth, ["inventoryAccess", "manageAccess"]))
      out.demands = demands;
    if (!canRead(auth, ["procurementAccess", "manageAccess"])) return out;

    const lines = new Map<string, Doc<"vendorOrderLines">>();
    const links = new Map<string, Doc<"vendorOrderLineDemands">>();
    for (const demand of demands) {
      for (const line of await ctx.db
        .query("vendorOrderLines")
        .withIndex("by_ingredientDemandId", (q) =>
          q.eq("ingredientDemandId", demand._id),
        )
        .collect())
        lines.set(line._id, line);
      for (const link of await ctx.db
        .query("vendorOrderLineDemands")
        .withIndex("by_ingredientDemandId", (q) =>
          q.eq("ingredientDemandId", demand._id),
        )
        .collect())
        links.set(link._id, link);
    }
    for (const link of links.values()) {
      if (lines.has(link.vendorOrderLineId)) continue;
      const line = await ctx.db.get(link.vendorOrderLineId);
      if (line) lines.set(line._id, line);
    }
    const orderIds = new Set<Id<"vendorOrders">>();
    for (const line of lines.values()) orderIds.add(line.vendorOrderId);
    for (const link of links.values())
      if (link.vendorOrderId) orderIds.add(link.vendorOrderId);
    const orders: Doc<"vendorOrders">[] = [];
    for (const id of orderIds) {
      const order = await ctx.db.get(id);
      if (order) orders.push(order);
    }

    out.orders = live(orders, tenantId);
    out.lineDemands = live([...links.values()], tenantId);
    out.lines = live([...lines.values()], tenantId).map((row) => ({
      ...row,
      lineTotal: row.orderedQuantity * row.unitCost,
      remainingQuantity: row.orderedQuantity - row.receivedQuantity,
      isFullyReceived:
        row.orderedQuantity > 0 && row.receivedQuantity >= row.orderedQuantity,
      hasReceivingDiscrepancy:
        row.discrepancyQuantity != null && row.discrepancyQuantity > 0,
    }));
    return out;
  },
});

/**
 * What reserving stock for one event needs: the event's ingredient needs and
 * holds, and the stock items, lots and every hold on those items for the
 * ingredients involved (free stock counts other events' holds too).
 */
export const stockForEvent = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      demands: [] as Doc<"ingredientDemands">[],
      items: [] as Doc<"inventoryItems">[],
      lots: [] as Doc<"inventoryLots">[],
      reservations: [] as Doc<"inventoryReservations">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const demands = live(
      await ctx.db
        .query("ingredientDemands")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      tenantId,
    );
    const eventHolds = live(
      await ctx.db
        .query("inventoryReservations")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect(),
      tenantId,
    );
    const ingredientIds = new Set<Id<"ingredients">>([
      ...demands.map((row) => row.ingredientId),
      ...eventHolds.map((row) => row.ingredientId),
    ]);

    const items = new Map<string, Doc<"inventoryItems">>();
    const lots = new Map<string, Doc<"inventoryLots">>();
    for (const ingredientId of ingredientIds) {
      for (const item of await ctx.db
        .query("inventoryItems")
        .withIndex("by_ingredientId", (q) => q.eq("ingredientId", ingredientId))
        .collect())
        items.set(item._id, item);
      for (const lot of await ctx.db
        .query("inventoryLots")
        .withIndex("by_ingredientId", (q) => q.eq("ingredientId", ingredientId))
        .collect())
        lots.set(lot._id, lot);
    }
    for (const hold of eventHolds) {
      if (!items.has(hold.inventoryItemId)) {
        const item = await ctx.db.get(hold.inventoryItemId);
        if (item) items.set(item._id, item);
      }
      if (hold.inventoryLotId && !lots.has(hold.inventoryLotId)) {
        const lot = await ctx.db.get(hold.inventoryLotId);
        if (lot) lots.set(lot._id, lot);
      }
    }
    const holds = new Map<string, Doc<"inventoryReservations">>(
      eventHolds.map((row) => [row._id, row]),
    );
    for (const itemId of items.keys()) {
      const id = ctx.db.normalizeId("inventoryItems", itemId);
      if (!id) continue;
      for (const hold of await ctx.db
        .query("inventoryReservations")
        .withIndex("by_inventoryItemId", (q) => q.eq("inventoryItemId", id))
        .collect())
        holds.set(hold._id, hold);
    }

    if (canRead(auth, ["inventoryAccess", "manageAccess"])) {
      out.demands = demands;
      out.items = live([...items.values()], tenantId);
    }
    if (canRead(auth, ["inventoryAccess", "procurementAccess", "manageAccess"]))
      out.lots = live([...lots.values()], tenantId);
    if (canRead(auth, ["inventoryAccess", "eventManageAccess"]))
      out.reservations = live([...holds.values()], tenantId);
    return out;
  },
});

/**
 * The records a BEO re-import resumes against, for one bundle: invoices with
 * its number and their payments, and the lines of the proposals and vendor
 * orders the page matched by number.
 */
export const importDirectoryRows = query({
  args: {
    invoiceNumber: v.string(),
    proposalIds: v.array(v.string()),
    vendorOrderIds: v.array(v.string()),
  },
  handler: async (ctx, { invoiceNumber, proposalIds, vendorOrderIds }) => {
    const auth = await getAuthContext(ctx);
    const out = {
      invoices: [] as Doc<"invoices">[],
      payments: [] as Doc<"payments">[],
      proposalLines: [] as Doc<"proposalLineItems">[],
      vendorOrderLines: [] as Doc<"vendorOrderLines">[],
    };
    if (!auth.tenantId) return out;
    const tenantId = auth.tenantId;
    const invoices = live(
      await ctx.db
        .query("invoices")
        .withIndex("by_tenantId_and_invoiceNumber", (q) =>
          q.eq("tenantId", tenantId).eq("invoiceNumber", invoiceNumber),
        )
        .collect(),
      tenantId,
    );
    if (canRead(auth, ["financeAccess", "manageAccess"]))
      out.invoices = invoices;
    if (canRead(auth, ["financeAccess"]))
      for (const invoice of invoices)
        out.payments.push(
          ...live(
            await ctx.db
              .query("payments")
              .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
              .collect(),
            tenantId,
          ),
        );
    if (canRead(auth, ["salesAccess"]))
      for (const raw of new Set(proposalIds)) {
        const proposalId = ctx.db.normalizeId("proposals", raw);
        if (!proposalId) continue;
        out.proposalLines.push(
          ...live(
            await ctx.db
              .query("proposalLineItems")
              .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
              .collect(),
            tenantId,
          ),
        );
      }
    if (canRead(auth, ["procurementAccess", "manageAccess"]))
      for (const raw of new Set(vendorOrderIds)) {
        const vendorOrderId = ctx.db.normalizeId("vendorOrders", raw);
        if (!vendorOrderId) continue;
        out.vendorOrderLines.push(
          ...live(
            await ctx.db
              .query("vendorOrderLines")
              .withIndex("by_vendorOrderId", (q) =>
                q.eq("vendorOrderId", vendorOrderId),
              )
              .collect(),
            tenantId,
          ),
        );
      }
    return out;
  },
});
