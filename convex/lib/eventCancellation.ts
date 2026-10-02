import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
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

/** Cancelling an event frees future equipment holds; checked-out custody stays. */
export async function standDownEventEquipmentReservations(
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

  const reservations = await ctx.db
    .query("equipmentReservations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const reservation of reservations) {
    if (
      reservation.tenantId !== tenantId ||
      reservation.deletedAt != null ||
      reservation.status !== "reserved"
    )
      continue;
    await ctx.runMutation(api.mutations.EquipmentReservation_cancel, {
      docId: reservation._id,
      version: reservation.version,
      reason: event.cancellationReason ?? "Event cancelled",
    });
  }
}

export type CancellationObligation = {
  code:
    | "pack_list_sent"
    | "equipment_still_out"
    | "vendor_rental_open"
    | "invoice_paid";
  recordId: string;
  label: string;
};

/**
 * PR10-07 / AC-137: what a cancelled event still owes after the stand-down.
 * Nothing here is cancelled for the office: a truck that already left, gear
 * that is still out, and a vendor rental that was asked for, confirmed or
 * delivered are real things someone must bring back or call about.
 */
export async function eventCancellationObligations(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
): Promise<CancellationObligation[]> {
  const [packs, holds, rentals, invoices] = await Promise.all([
    ctx.db
      .query("packLists")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("equipmentReservations")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("rentalOrderLines")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
    ctx.db
      .query("invoices")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .collect(),
  ]);
  const out: CancellationObligation[] = [];
  for (const pack of packs) {
    if (pack.tenantId !== tenantId || pack.deletedAt != null) continue;
    if (pack.status !== "dispatched") continue;
    out.push({
      code: "pack_list_sent",
      recordId: String(pack._id),
      label: `${pack.name} already went out. Bring it back and check it in.`,
    });
  }
  for (const hold of holds) {
    if (hold.tenantId !== tenantId || hold.deletedAt != null) continue;
    if (hold.status !== "checked_out") continue;
    const equipment = await ctx.db.get(hold.equipmentId as Id<"equipments">);
    const name =
      equipment && equipment.tenantId === tenantId ? equipment.name : "Equipment";
    out.push({
      code: "equipment_still_out",
      recordId: String(hold._id),
      label: `${hold.quantity} ${name} still out. Do the return check when it is back.`,
    });
  }
  for (const line of rentals) {
    if (line.tenantId !== tenantId || line.deletedAt != null) continue;
    if (!["requested", "confirmed", "delivered"].includes(line.status)) continue;
    out.push({
      code: "vendor_rental_open",
      recordId: String(line._id),
      label:
        line.status === "delivered"
          ? `${line.quantity} ${line.description} from the rental company is here. Send it back and enter the count.`
          : `${line.quantity} ${line.description} is ${line.status} with the rental company. Call them to cancel, then mark it cancelled.`,
    });
  }
  // The cancel never voids an invoice with money on it. No amount here: this
  // list is shown to logistics staff too.
  for (const invoice of invoices) {
    if (invoice.tenantId !== tenantId || invoice.deletedAt != null) continue;
    if (invoice.status === "voided" || !(invoice.amountPaid > 0)) continue;
    out.push({
      code: "invoice_paid",
      recordId: String(invoice._id),
      label:
        "The client already paid on an invoice for this event. Finance decides with them: refund it or keep it as credit.",
    });
  }
  return out;
}

/** Cancelling an event releases assigned crew; performed attendance stays. */
export async function standDownEventAssignments(
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

  const assignments = await ctx.db
    .query("eventAssignments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const assignment of assignments) {
    if (
      assignment.tenantId !== tenantId ||
      assignment.deletedAt != null ||
      !["assigned", "confirmed"].includes(assignment.status)
    )
      continue;
    await ctx.runMutation(api.mutations.EventAssignment_unassign, {
      docId: assignment._id,
      version: assignment.version,
    });
  }
}
