// Authored seam: settle the buying of events that finished before the
// finished-event rule existed, and work the weekly drafts out again
// (2026-10-12).
//
// Since af395ffd and 7705e4db a finished event's purchase needs settle when it
// completes or closes out, so they stop feeding the weekly draft. Events that
// finished earlier kept open or ordered needs, and drafts made by the older
// code kept amounts and stock shares that no longer match the week (a draft
// wanting 123.9 lb of chicken for events already served). The purchasing page
// shows how many such events and lines there are; a person settles them here
// through the same settleEventPurchasing step a closeout runs, and each
// automatic draft line is worked out again with the formula the line itself
// uses. Lines set by hand are never changed. Nothing runs on its own.

import { ConvexError } from "convex/values";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import {
  retireUnusedAutomaticDraft,
  settleEventPurchasing,
} from "./lib/purchasingEvents";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";

const FINISHED = new Set(["completed", "closed_out"]);
const UNSETTLED = ["open", "ordered", "fulfilled"] as const;
// procurementAccess or manageAccess (base.manifest), the roles that may run
// the order commands the settle step uses.
const BUYING_ROLES = new Set([
  "admin",
  "owner",
  "system",
  "procurement_staff",
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
]);

async function finishedWithUnsettledNeeds(ctx: QueryCtx, tenantId: string) {
  const byEvent = new Map<string, number>();
  for (const status of UNSETTLED) {
    const needs = await ctx.db
      .query("purchaseNeeds")
      .withIndex("by_tenantId_and_status", (q) =>
        q.eq("tenantId", tenantId).eq("status", status),
      )
      .collect();
    for (const need of needs) {
      if (need.deletedAt != null || need.eventId == null) continue;
      const key = String(need.eventId);
      byEvent.set(key, (byEvent.get(key) ?? 0) + 1);
    }
  }
  const out: Array<{ eventId: Id<"events">; title: string; needs: number }> =
    [];
  for (const [eventId, needs] of byEvent) {
    const event = (await ctx.db.get(
      eventId as Id<"events">,
    )) as Doc<"events"> | null;
    if (
      event &&
      event.tenantId === tenantId &&
      event.deletedAt == null &&
      FINISHED.has(String(event.stage))
    )
      out.push({ eventId: event._id, title: event.title, needs });
  }
  return out;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.00005;

type Recount = {
  line: Doc<"vendorOrderLines">;
  planned: number;
  stockApplied: number;
  staleLinks: Doc<"vendorOrderLineDemands">[];
};

/**
 * Each automatic line of each open weekly draft, worked out again from the
 * week's live needs with the formula of VendorOrderLine.ensureWeeklyLine
 * (order.manifest): open + ordered + received needs, less supply already on
 * its way, less shelf stock not claimed by another open line. Lines set by
 * hand are left alone. Only lines whose amount, stock share or links are out
 * of date are returned.
 */
/** The automatic, unreceived lines of open weekly drafts, with their week. */
async function draftLines(ctx: QueryCtx, tenantId: string) {
  const drafts = (
    await ctx.db
      .query("vendorOrders")
      .withIndex("by_tenantId_and_status", (q) =>
        q.eq("tenantId", tenantId).eq("status", "draft"),
      )
      .collect()
  ).filter(
    (order) => order.deletedAt == null && order.sourceRangeStart != null,
  );
  const out: Array<{ lineId: Id<"vendorOrderLines">; week: number }> = [];
  for (const order of drafts) {
    const lines = await ctx.db
      .query("vendorOrderLines")
      .withIndex("by_vendorOrderId", (q) => q.eq("vendorOrderId", order._id))
      .collect();
    for (const line of lines)
      if (isAutomaticOpenLine(line, tenantId))
        out.push({ lineId: line._id, week: Number(order.sourceRangeStart) });
  }
  return out;
}

const isAutomaticOpenLine = (line: Doc<"vendorOrderLines">, tenantId: string) =>
  line.tenantId === tenantId &&
  line.deletedAt == null &&
  line.status === "added" &&
  line.receivedQuantity === 0 &&
  line.quantityIsManual === false;

/**
 * One line worked out again from the current records, or null when it is
 * already right. Reads the other lines' stock shares as they are now, so
 * lines worked out one after another settle on one sharing of the shelf.
 */
async function recountLine(
  ctx: QueryCtx,
  tenantId: string,
  lineId: Id<"vendorOrderLines">,
  week: number,
): Promise<Recount | null> {
  const line = await ctx.db.get(lineId);
  if (!line || !isAutomaticOpenLine(line, tenantId)) return null;
  const needs = (
    await ctx.db
      .query("purchaseNeeds")
      .withIndex("by_ingredientId", (q) =>
        q.eq("ingredientId", line.ingredientId),
      )
      .collect()
  ).filter(
    (need) =>
      need.tenantId === tenantId &&
      need.deletedAt == null &&
      need.unit === line.unit &&
      need.purchasingWeekStart === week,
  );
  const sum = (status: string) =>
    needs
      .filter((need) => need.status === status)
      .reduce((total, need) => total + Number(need.requiredQuantity), 0);
  const sameItemLines = (
    await ctx.db
      .query("vendorOrderLines")
      .withIndex("by_ingredientId", (q) =>
        q.eq("ingredientId", line.ingredientId),
      )
      .collect()
  ).filter(
    (row) =>
      row.tenantId === tenantId &&
      row.deletedAt == null &&
      row.unit === line.unit,
  );
  const pendingSupply = sameItemLines
    .filter((row) => row.supplyWeekStart === week)
    .reduce((total, row) => total + Number(row.pendingSupplyQuantity ?? 0), 0);
  const claimedElsewhere = sameItemLines
    .filter((row) => row._id !== line._id && row.status === "added")
    .reduce((total, row) => total + Number(row.stockAppliedQuantity ?? 0), 0);
  const onHand = (
    await ctx.db
      .query("inventoryItems")
      .withIndex("by_ingredientId", (q) =>
        q.eq("ingredientId", line.ingredientId),
      )
      .collect()
  )
    .filter(
      (item) =>
        item.tenantId === tenantId &&
        item.deletedAt == null &&
        item.unit === line.unit,
    )
    .reduce((total, item) => total + Number(item.quantityOnHand ?? 0), 0);
  const availableStock = Math.max(0, onHand - claimedElsewhere);
  const requirement = Math.max(
    0,
    sum("open") + sum("ordered") + sum("fulfilled") - pendingSupply,
  );
  const planned = Math.max(0, requirement - availableStock);
  const stockApplied = Math.min(availableStock, requirement);
  // A link whose requirement is spent (its need used, closed or gone) no
  // longer belongs on the line.
  const links = (
    await ctx.db
      .query("vendorOrderLineDemands")
      .withIndex("by_vendorOrderLineId", (q) =>
        q.eq("vendorOrderLineId", line._id),
      )
      .collect()
  ).filter(
    (link) =>
      link.tenantId === tenantId &&
      link.deletedAt == null &&
      link.removedAt == null,
  );
  const staleLinks = links.filter(
    (link) =>
      !needs.some(
        (need) =>
          need.ingredientDemandId === link.ingredientDemandId &&
          ["open", "ordered", "fulfilled"].includes(need.status),
      ),
  );
  if (
    near(planned, Number(line.orderedQuantity)) &&
    near(planned, Number(line.plannedQuantity ?? 0)) &&
    near(stockApplied, Number(line.stockAppliedQuantity ?? 0)) &&
    staleLinks.length === 0
  )
    return null;
  return { line, planned, stockApplied, staleLinks };
}

async function staleDraftLines(ctx: QueryCtx, tenantId: string) {
  const out: Recount[] = [];
  for (const { lineId, week } of await draftLines(ctx, tenantId)) {
    const recount = await recountLine(ctx, tenantId, lineId, week);
    if (recount) out.push(recount);
  }
  return out;
}

async function applyRecount(ctx: MutationCtx, recount: Recount) {
  const { line, planned, stockApplied, staleLinks } = recount;
  for (const link of staleLinks)
    await ctx.runMutation(api.mutations.VendorOrderLineDemand_retire, {
      docId: link._id,
      version: link.version,
      reason: "Its event is finished; it no longer counts",
    });
  const fresh = await ctx.db.get(line._id);
  if (!fresh) return;
  await ctx.runMutation(
    api.mutations.VendorOrderLine_reconcileDraftRequirement,
    {
      docId: fresh._id,
      version: fresh.version,
      plannedQuantity: planned,
      quantityIsManual: false,
    },
  );
  // The line's claim on shelf stock follows its new requirement, so other
  // lines see the stock it no longer needs.
  const after = await ctx.db.get(line._id);
  if (after && !near(Number(after.stockAppliedQuantity ?? 0), stockApplied))
    await ctx.db.patch(after._id, {
      stockAppliedQuantity: stockApplied,
      updatedAt: Date.now(),
    });
  if (planned === 0) await retireUnusedAutomaticDraft(ctx, line._id);
}

function allowed(auth: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    BUYING_ROLES.has(auth.role) &&
    !(
      orgCapabilityDeniesAction(
        "procurementAccess",
        auth.disabledCapabilities,
      ) && orgCapabilityDeniesAction("manageAccess", auth.disabledCapabilities)
    )
  );
}

/** Finished events whose buying still counts on a weekly draft. */
export const finishedEventsStillBuying = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !allowed(auth)) return [];
    return finishedWithUnsettledNeeds(ctx, auth.tenantId);
  },
});

/** Automatic lines on open weekly drafts whose amount is out of date. */
export const staleDraftLineCount = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !allowed(auth)) return 0;
    return (await staleDraftLines(ctx, auth.tenantId)).length;
  },
});

/**
 * Settle the finished events as each one's closeout now does, then work
 * every automatic draft line out again from what is left.
 */
export const settleFinishedEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !allowed(auth))
      throw new ConvexError("Purchasing access is needed to do this.");
    const events = await finishedWithUnsettledNeeds(ctx, auth.tenantId);
    for (const event of events) await settleEventPurchasing(ctx, event.eventId);
    const lines = await recountDraftLines(ctx, auth.tenantId);
    return { events: events.length, lines };
  },
});

/**
 * Every automatic draft line worked out again, line by line from the current
 * records, until a pass changes nothing: a line that gives back shelf stock
 * can let another line buy less. Returns how many lines changed.
 */
export async function recountDraftLines(
  ctx: MutationCtx,
  tenantId: string,
): Promise<number> {
  const lines = await draftLines(ctx, tenantId);
  const changed = new Set<string>();
  for (let pass = 0; pass < 5; pass++) {
    let any = false;
    for (const { lineId, week } of lines) {
      const recount = await recountLine(ctx, tenantId, lineId, week);
      if (!recount) continue;
      await applyRecount(ctx, recount);
      changed.add(String(lineId));
      any = true;
    }
    if (!any) break;
  }
  return changed.size;
}
