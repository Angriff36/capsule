// Cascade preview — what a high-fan-out event move will create elsewhere,
// read before the user confirms it. Read-only: it mirrors the conditions the
// EventApproved / EventClosedOut reactions and their authored seams use
// (purchase-need.manifest, batch.manifest, pack-list.manifest,
// event-closeout.manifest, convex/lib/operationalEvents.ts) and counts what
// is still missing. The commands keep their own guards; this only informs.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  approvedRentalUnits,
  heldUnits,
  vendorRentedUnits,
} from "./lib/acceptedRentalHolds";
import {
  parseTemplateLines,
  pickStaffingTemplate,
  templateLineCount,
  templateLineKey,
} from "../src/lib/staffingTemplates";

export type CascadeEffect = { key: string; count: number; label: string };
export type CascadePreview = { effects: CascadeEffect[] };

const live = <T extends { tenantId: string; deletedAt?: unknown }>(
  rows: T[],
  tenantId: string,
) => rows.filter((row) => row.tenantId === tenantId && row.deletedAt == null);

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

async function purchaseNeedCount(ctx: QueryCtx, event: Doc<"events">) {
  const demands = live(
    await ctx.db
      .query("ingredientDemands")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    event.tenantId,
  );
  // ensurePurchaseEligible fills a missing eligibility on calculated rows,
  // then PurchaseNeed.create runs for every row eligible for this event.
  return demands.filter(
    (row) =>
      row.status === "calculated" &&
      (row.purchaseEligibleEventId == null ||
        row.purchaseEligibleEventId === String(event._id)),
  ).length;
}

async function productionBatchCount(ctx: QueryCtx, event: Doc<"events">) {
  const [seeds, batches] = await Promise.all([
    ctx.db
      .query("eventDishComponentSeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    ctx.db
      .query("productionBatches")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
  ]);
  const planned = new Set(
    live(batches, event.tenantId).map((row) => String(row.componentId)),
  );
  return live(seeds, event.tenantId).filter(
    (row) => !planned.has(String(row.componentId)),
  ).length;
}

async function packListCount(ctx: QueryCtx, event: Doc<"events">) {
  const lists = live(
    await ctx.db
      .query("packLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    event.tenantId,
  );
  return lists.some((row) => row.activeEventId === String(event._id)) ? 0 : 1;
}

async function draftInvoiceCount(ctx: QueryCtx, event: Doc<"events">) {
  if (!(Number(event.quotedPrice ?? 0) > 0)) return 0;
  const invoices = await ctx.db
    .query("invoices")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  return live(invoices, event.tenantId).length > 0 ? 0 : 1;
}

async function staffPositionCount(
  ctx: QueryCtx,
  event: Doc<"events">,
  workforceOff: boolean,
) {
  if (workforceOff) return 0;
  const templates = await ctx.db
    .query("staffingTemplates")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", event.tenantId))
    .collect();
  const template = pickStaffingTemplate(templates, {
    serviceStyleId: event.serviceStyleId ?? null,
    guests: event.expectedHeadcount ?? null,
  });
  if (!template) return 0;
  const needs = live(
    await ctx.db
      .query("eventStaffNeeds")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    event.tenantId,
  ).filter(
    (row) =>
      row.staffingTemplateId === template._id && row.status !== "cancelled",
  );
  let missing = 0;
  for (const [index, line] of parseTemplateLines(template.lines).entries()) {
    const key = templateLineKey(line, index);
    const current = needs.filter((row) => row.templateLineKey === key).length;
    missing += Math.max(
      0,
      templateLineCount(line, event.expectedHeadcount ?? null) - current,
    );
  }
  return missing;
}

async function rentalHoldCount(ctx: QueryCtx, event: Doc<"events">) {
  if (event.startsAt == null || event.endsAt == null) return 0;
  const [wanted, held, rented] = await Promise.all([
    approvedRentalUnits(ctx, event),
    heldUnits(ctx, event),
    vendorRentedUnits(ctx, event),
  ]);
  let items = 0;
  for (const [id, units] of wanted)
    if (units - (held.get(id) ?? 0) - (rented.get(id) ?? 0) > 0) items++;
  return items;
}

async function closeoutEffects(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<CascadeEffect[]> {
  const closeouts = live(
    await ctx.db
      .query("eventCloseouts")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect(),
    event.tenantId,
  );
  return [
    closeouts.length > 0
      ? {
          key: "closeout",
          count: 1,
          label:
            "Reset the event's closeout draft to the quoted budget with zero actuals",
        }
      : {
          key: "closeout",
          count: 1,
          label:
            "Start a closeout draft with the quoted budget and zero actuals for finance",
        },
  ];
}

export const eventCascadePreview = query({
  args: {
    eventId: v.id("events"),
    action: v.union(v.literal("approve"), v.literal("closeOut")),
  },
  handler: async (ctx, args): Promise<CascadePreview | null> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const event = await ctx.db.get(args.eventId as Id<"events">);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null)
      return null;
    if (args.action === "closeOut")
      return { effects: await closeoutEffects(ctx, event) };

    const [needs, batches, packList, invoice, staff, rentals] =
      await Promise.all([
        purchaseNeedCount(ctx, event),
        productionBatchCount(ctx, event),
        packListCount(ctx, event),
        draftInvoiceCount(ctx, event),
        staffPositionCount(
          ctx,
          event,
          auth.disabledCapabilities.includes("workforce"),
        ),
        rentalHoldCount(ctx, event),
      ]);
    const effects: CascadeEffect[] = [
      {
        key: "purchaseNeeds",
        count: needs,
        label: `Create ${plural(needs, "purchase need")} for this week's order`,
      },
      {
        key: "productionBatches",
        count: batches,
        label: `Plan ${plural(batches, "production batch", "production batches")} for the kitchen`,
      },
      {
        key: "staffPositions",
        count: staff,
        label: `Post ${plural(staff, "open staff position")} from the crew template`,
      },
      {
        key: "rentalHolds",
        count: rentals,
        label: `Hold ${plural(rentals, "approved rental item")} (only what is free)`,
      },
      {
        key: "packList",
        count: packList,
        label: "Open the event pack list",
      },
      {
        key: "invoice",
        count: invoice,
        label: "Open an unsent draft invoice for the quoted price",
      },
    ];
    return { effects: effects.filter((effect) => effect.count > 0) };
  },
});
