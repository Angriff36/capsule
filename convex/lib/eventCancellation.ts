import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthContext, requireTenant } from "./authContext";

/** Stop unfinished logistics and unpaid billing; preserve performed and paid facts. */
export async function standDownEventLogisticsAndBilling(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const event = await ctx.db.get(eventId);
  if (
    !event ||
    event.tenantId !== tenantId ||
    event.deletedAt != null ||
    event.stage !== "cancelled"
  )
    throw new Error("Event stand-down requires a cancelled event");

  const [packs, deliveries, invoices] = await Promise.all([
    ctx.db
      .query("packLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("deliveries")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("invoices")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  ]);
  for (const pack of packs) {
    if (
      pack.tenantId !== tenantId ||
      pack.deletedAt != null ||
      !["draft", "packing", "packed", "loaded"].includes(pack.status)
    )
      continue;
    await ctx.runMutation(api.mutations.PackList_standDownWithEvent, {
      docId: pack._id,
      version: pack.version,
    });
  }
  for (const delivery of deliveries) {
    if (
      delivery.tenantId !== tenantId ||
      delivery.deletedAt != null ||
      !["scheduled", "in_transit"].includes(delivery.status)
    )
      continue;
    await ctx.runMutation(api.mutations.Delivery_standDownWithEvent, {
      docId: delivery._id,
      version: delivery.version,
    });
  }
  for (const invoice of invoices) {
    if (
      invoice.tenantId !== tenantId ||
      invoice.deletedAt != null ||
      invoice.amountPaid !== 0 ||
      !["draft", "sent", "viewed", "overdue"].includes(invoice.status)
    )
      continue;
    await ctx.runMutation(api.mutations.Invoice_markVoided, {
      docId: invoice._id,
      version: invoice.version,
      reason: event.cancellationReason ?? "Event cancelled",
    });
  }
}
