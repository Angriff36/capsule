/**
 * AUTHOR SEAM - PL-CLOSEOUT (spec §15.3 / §15.5, AC-625, AC-626, AC-628,
 * AC-386): the closeout numbers of an event come from the records Capsule
 * already has, not from a person retyping them.
 *
 *  - `eventCloseoutSources` reads every record behind each closeout number
 *    (invoices, credits, payments, received food orders, waste, clocked
 *    time, rentals, equipment problems, commissions, truck run costs, guest
 *    check-ins) and
 *    returns plan vs actual per line, which lines are still incomplete, and
 *    the exact records (id + version + amount) behind each number.
 *  - `captureCloseoutFromSources` stores those numbers on the event's draft
 *    closeout through the governed EventCloseout.capture command, with the
 *    record list frozen in `sourceSnapshot`. A person types only the lines
 *    the records cannot answer.
 *  - `correctCloseoutFromSources` is the audited correction of a finalized
 *    closeout (EventCloseout.correct): a reason, the next revision number,
 *    fresh numbers and records; the earlier result stays in the ledger.
 *  - `closeoutResults` lists every finalized / corrected result, oldest first.
 *
 * Money readers only: the closeout read tier (financeAccess |
 * eventManageAccess). Writes go through the generated commands, which check
 * their own roles again.
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { loadEventLabor } from "./laborSummary";
import {
  closeoutCaptureValues,
  closeoutSourceSnapshot,
  projectCloseoutSources,
  type CloseoutLineKey,
  type CloseoutProjection,
} from "../src/lib/closeoutSourceProjection";

// Mirrors financeAccess | eventManageAccess in src/foundation/base.manifest
// (finance_staff, finance_manager, event_manager, admin, owner, system).
const CLOSEOUT_READ_ROLES = new Set([
  "finance_staff",
  "finance_manager",
  "event_manager",
  "admin",
  "owner",
  "system",
]);

const entered = v.optional(
  v.object({
    revenue: v.optional(v.number()),
    ingredient: v.optional(v.number()),
    waste: v.optional(v.number()),
    labor: v.optional(v.number()),
    vendor: v.optional(v.number()),
    commission: v.optional(v.number()),
    transport: v.optional(v.number()),
    headcount: v.optional(v.number()),
  }),
);

type Entered = Partial<Record<CloseoutLineKey, number>>;

async function byEvent<T extends string>(
  ctx: QueryCtx,
  table: T,
  eventId: string,
): Promise<any[]> {
  return await (ctx.db.query(table as any) as any)
    .withIndex("by_eventId", (q: any) => q.eq("eventId", eventId))
    .collect();
}

/**
 * This event's part of the shared weekly orders. A weekly order belongs to
 * no one event: each line is linked to the food amounts (per event) it buys
 * for. The event's part of a line is its linked amount over all live linked
 * amounts on that line, so two events sharing one flour line each carry
 * their own part of what was ordered and received - never the whole line
 * twice. Orders already tied to this event are counted directly and skipped.
 */
async function weeklyOrderShares(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
  counted: Set<string>,
) {
  const demands = (
    await ctx.db
      .query("ingredientDemands")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect()
  ).filter((row) => row.tenantId === tenantId);
  const share = new Map<string, number>();
  for (const demand of demands) {
    const links = await ctx.db
      .query("vendorOrderLineDemands")
      .withIndex("by_ingredientDemandId", (q) =>
        q.eq("ingredientDemandId", demand._id),
      )
      .collect();
    for (const link of links) {
      if (link.tenantId !== tenantId || link.removedAt != null) continue;
      const key = String(link.vendorOrderLineId);
      share.set(key, (share.get(key) ?? 0) + Number(link.contributionQuantity));
    }
  }
  const byOrder = new Map<
    string,
    { order: Doc<"vendorOrders">; lines: Array<Record<string, unknown>> }
  >();
  for (const [lineKey, mineQuantity] of share) {
    const line = await ctx.db.get(lineKey as Id<"vendorOrderLines">);
    if (!line || line.tenantId !== tenantId || line.deletedAt != null) continue;
    const order = await ctx.db.get(line.vendorOrderId);
    if (!order || order.tenantId !== tenantId || counted.has(String(order._id)))
      continue;
    const all = (
      await ctx.db
        .query("vendorOrderLineDemands")
        .withIndex("by_vendorOrderLineId", (q) =>
          q.eq("vendorOrderLineId", line._id),
        )
        .collect()
    ).filter((link) => link.tenantId === tenantId && link.removedAt == null);
    const total = all.reduce(
      (sum, l) => sum + Number(l.contributionQuantity),
      0,
    );
    if (!(total > 0)) continue;
    const part = Math.min(1, mineQuantity / total);
    const entry = byOrder.get(String(order._id)) ?? { order, lines: [] };
    entry.lines.push({
      ...line,
      _id: String(line._id),
      orderedQuantity: Number(line.orderedQuantity) * part,
      receivedQuantity: Number(line.receivedQuantity ?? 0) * part,
    });
    byOrder.set(String(order._id), entry);
  }
  return [...byOrder.values()].map(({ order, lines }) => ({
    ...order,
    _id: String(order._id),
    lines: lines as never[],
  }));
}

/** The event's truck runs and vendor drops still on it, named for people. */
async function truckRuns(ctx: QueryCtx, tenantId: string, eventId: string) {
  const rows = (
    await ctx.db
      .query("eventVehicleAssignments")
      .withIndex("by_activeEventId", (q) => q.eq("activeEventId", eventId))
      .collect()
  ).filter(
    (row) =>
      row.tenantId === tenantId &&
      row.deletedAt == null &&
      row.releasedAt == null,
  );
  return await Promise.all(
    rows.map(async (row) => {
      const vehicle = row.vehicleId ? await ctx.db.get(row.vehicleId) : null;
      const trailer = row.trailerId ? await ctx.db.get(row.trailerId) : null;
      const own = <T extends { tenantId: string }>(doc: T | null) =>
        doc && doc.tenantId === tenantId ? doc : null;
      const truck = own(vehicle);
      const label =
        row.vendorName?.trim() ||
        (truck
          ? `${truck.make} ${truck.model}`.trim() || truck.registration
          : own(trailer)?.registration) ||
        "Truck run";
      return {
        _id: String(row._id),
        version: row.version,
        label,
        tripCost: row.tripCost ?? null,
      };
    }),
  );
}

async function loadProjection(
  ctx: QueryCtx,
  tenantId: string,
  event: Doc<"events">,
): Promise<CloseoutProjection> {
  const eventId = String(event._id);
  const mine = <T extends { tenantId?: string }>(rows: T[]) =>
    rows.filter((row) => row.tenantId === tenantId);
  const [invoices, waste, orders, rentals, issues, attributions, guests] =
    await Promise.all([
      byEvent(ctx, "invoices", eventId),
      byEvent(ctx, "wasteRecords", eventId),
      byEvent(ctx, "vendorOrders", eventId),
      byEvent(ctx, "rentalOrderLines", eventId),
      byEvent(ctx, "equipmentIssues", eventId),
      byEvent(ctx, "revenueAttributions", eventId),
      byEvent(ctx, "eventGuests", eventId),
    ]);
  const eventInvoices = mine(invoices as Doc<"invoices">[]);
  const payments = new Map<string, Doc<"payments">>();
  const creditMemos: Doc<"creditMemos">[] = [];
  for (const invoice of eventInvoices) {
    if (invoice.deletedAt != null) continue;
    const [paid, memos] = await Promise.all([
      ctx.db
        .query("payments")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoice._id))
        .collect(),
      ctx.db
        .query("creditMemos")
        .withIndex("by_sourceInvoiceId", (q) =>
          q.eq("sourceInvoiceId", invoice._id),
        )
        .collect(),
    ]);
    for (const payment of mine(paid))
      payments.set(String(payment._id), payment);
    creditMemos.push(...mine(memos));
  }
  const vendorOrders = [];
  for (const order of mine(orders as Doc<"vendorOrders">[])) {
    const lines = await ctx.db
      .query("vendorOrderLines")
      .withIndex("by_vendorOrderId", (q) => q.eq("vendorOrderId", order._id))
      .collect();
    vendorOrders.push({
      ...order,
      _id: String(order._id),
      lines: mine(lines).map((line) => ({ ...line, _id: String(line._id) })),
    });
  }
  vendorOrders.push(
    ...(await weeklyOrderShares(
      ctx,
      tenantId,
      event._id,
      new Set(vendorOrders.map((order) => order._id)),
    )),
  );
  const labor = await loadEventLabor(ctx, tenantId, eventId);
  const minutesOf = (record: Doc<"timeRecords">) =>
    Math.max(
      0,
      ((record.clockOutAt ?? 0) - (record.clockInAt ?? 0)) / 60_000 -
        Math.max(0, Number(record.breakMinutes ?? 0)),
    );
  const ids = <T extends { _id: unknown }>(rows: T[]) =>
    rows.map((row) => ({ ...row, _id: String(row._id) }));
  return projectCloseoutSources({
    event,
    invoices: ids(eventInvoices),
    payments: ids([...payments.values()]),
    creditMemos: ids(creditMemos),
    vendorOrders,
    waste: ids(mine(waste as Doc<"wasteRecords">[])),
    labor: {
      cost: labor.cost,
      scheduledCost: labor.scheduledCost,
      unpricedMinutes: labor.unpricedMinutes,
      peopleMissingRates: labor.peopleMissingRates,
      records: labor.records.map((record) => ({
        _id: String(record._id),
        version: record.version,
        minutes: minutesOf(record),
      })),
    },
    rentals: ids(mine(rentals as Doc<"rentalOrderLines">[])),
    equipmentIssues: ids(mine(issues as Doc<"equipmentIssues">[])),
    attributions: ids(mine(attributions as Doc<"revenueAttributions">[])),
    guests: ids(mine(guests as Doc<"eventGuests">[])),
    truckRuns: await truckRuns(ctx, tenantId, eventId),
  });
}

async function readableEvent(ctx: QueryCtx, eventId: Id<"events">) {
  const auth = await getAuthContext(ctx);
  if (!auth.tenantId || !CLOSEOUT_READ_ROLES.has(auth.role)) return null;
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== auth.tenantId || event.deletedAt != null)
    return null;
  return { tenantId: auth.tenantId, event };
}

async function eventCloseoutRow(
  ctx: QueryCtx,
  tenantId: string,
  eventId: string,
): Promise<Doc<"eventCloseouts"> | null> {
  const rows = await ctx.db
    .query("eventCloseouts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId as never))
    .collect();
  const live = rows.filter(
    (row) => row.tenantId === tenantId && row.deletedAt == null,
  );
  return (
    live.find((row) => row.status === "finalized") ??
    live.sort((a, b) => b._creationTime - a._creationTime)[0] ??
    null
  );
}

/** Plan vs actual per closeout line, with the records behind each number. */
export const eventCloseoutSources = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const scope = await readableEvent(ctx, args.eventId);
    if (!scope) return null;
    const closeout = await eventCloseoutRow(
      ctx,
      scope.tenantId,
      String(args.eventId),
    );
    return {
      projection: await loadProjection(ctx, scope.tenantId, scope.event),
      closeout: closeout
        ? {
            _id: closeout._id,
            version: closeout.version,
            status: closeout.status,
            revision: closeout.revision ?? 0,
          }
        : null,
    };
  },
});

function sourceValues(projection: CloseoutProjection, typed: Entered) {
  try {
    const { values, enteredKeys } = closeoutCaptureValues(projection, typed);
    return {
      values,
      sourceSnapshot: closeoutSourceSnapshot(projection, enteredKeys, typed),
    };
  } catch (error) {
    throw new ConvexError((error as Error).message);
  }
}

/** Store the record-backed numbers on the event's draft closeout. */
export const captureCloseoutFromSources = mutation({
  args: {
    eventId: v.id("events"),
    entered,
    unresolvedIssues: v.optional(v.string()),
    performanceNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const scope = await readableEvent(ctx, args.eventId);
    if (!scope) throw new ConvexError("You can't close out this event.");
    const projection = await loadProjection(ctx, scope.tenantId, scope.event);
    const { values, sourceSnapshot } = sourceValues(
      projection,
      args.entered ?? {},
    );
    const eventId = String(args.eventId);
    const existing = await eventCloseoutRow(ctx, scope.tenantId, eventId);
    // A recapture keeps the saved notes unless the person typed new ones.
    const params = {
      eventId,
      ...values,
      unresolvedIssues:
        args.unresolvedIssues ?? existing?.unresolvedIssues ?? undefined,
      performanceNotes:
        args.performanceNotes ?? existing?.performanceNotes ?? undefined,
      notes: args.notes ?? existing?.notes ?? undefined,
      sourceSnapshot,
    };
    if (existing?.status === "finalized") {
      throw new ConvexError(
        "This closeout is final. Use Correct to change it with a reason.",
      );
    }
    if (existing) {
      await ctx.runMutation(api.mutations.EventCloseout_capture, {
        docId: existing._id,
        version: existing.version,
        ...params,
      });
      return { closeoutId: existing._id };
    }
    const created = (await ctx.runMutation(
      api.mutations.EventCloseout_createViaCapture,
      params,
    )) as { docId?: Id<"eventCloseouts"> } | null;
    return { closeoutId: created?.docId ?? null };
  },
});

/** Audited correction of a finalized closeout: next revision, old one kept. */
export const correctCloseoutFromSources = mutation({
  args: {
    closeoutId: v.id("eventCloseouts"),
    reason: v.string(),
    entered,
  },
  handler: async (ctx, args) => {
    const closeout = await ctx.db.get(args.closeoutId);
    if (!closeout) throw new ConvexError("This closeout was not found.");
    const scope = await readableEvent(ctx, closeout.eventId as Id<"events">);
    if (!scope || closeout.tenantId !== scope.tenantId)
      throw new ConvexError("This closeout was not found.");
    const projection = await loadProjection(ctx, scope.tenantId, scope.event);
    const { values, sourceSnapshot } = sourceValues(
      projection,
      args.entered ?? {},
    );
    await ctx.runMutation(api.mutations.EventCloseout_correct, {
      docId: closeout._id,
      version: closeout.version,
      reason: args.reason,
      ...values,
      sourceSnapshot,
    });
    return { closeoutId: closeout._id };
  },
});

/** Every finalized and corrected result of one closeout, oldest first. */
export const closeoutResults = query({
  args: { closeoutId: v.id("eventCloseouts") },
  handler: async (ctx, args) => {
    const closeout = await ctx.db.get(args.closeoutId);
    if (!closeout) return null;
    const scope = await readableEvent(ctx, closeout.eventId as Id<"events">);
    if (!scope || closeout.tenantId !== scope.tenantId) return null;
    const rows = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) =>
        q.eq("entityId", String(args.closeoutId)),
      )
      .collect();
    return rows
      .filter(
        (row) =>
          row.type === "EventCloseoutFinalized" ||
          row.type === "EventCloseoutCorrected",
      )
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((row) => {
        const p = row.payload as Record<string, unknown>;
        return {
          revision: Number(p.revision ?? 1),
          kind:
            row.type === "EventCloseoutCorrected" ? "corrected" : "finalized",
          reason: typeof p.reason === "string" ? p.reason : null,
          at: row.createdAt,
          actualRevenue: Number(p.actualRevenue ?? 0),
          totalActualCost: Number(p.totalActualCost ?? 0),
          grossProfit: Number(p.grossProfit ?? 0),
          actualHeadcount:
            p.actualHeadcount == null ? null : Number(p.actualHeadcount),
          sourceSnapshot:
            typeof p.sourceSnapshot === "string" ? p.sourceSnapshot : null,
        };
      });
  },
});
