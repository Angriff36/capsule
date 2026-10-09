import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  availableEquipmentQuantity,
  equipmentBlock,
  unitsOutOfUse,
} from "./equipmentReservationAvailability";
import { placeEquipmentHold } from "./equipmentHold";
import { openHoldsForEquipment, openIssuesForEquipment } from "./openEquipmentHolds";

/** Stages where the event is booked and its gear should be held. */
const HOLD_STAGES = new Set(["approved", "sales_lock", "executing", "final"]);

/** Holds that already cover the event: booked, out, or back. */
const COVERING = new Set(["reserved", "checked_out", "returned"]);

type Line = Doc<"proposalLineItems">;

/** How many of the item one approved line asks for: a per-unit line its
 * count, a per-person line the approved guest count, any other line one. */
function unitsForLine(line: Line, guestCount: number): number {
  if (line.pricingBasis === "per_unit") return Math.ceil(line.quantity);
  if (line.pricingBasis === "per_person") return Math.ceil(guestCount);
  return 1;
}

/**
 * Rental items the client approved for this event, per item: the accepted
 * proposal(s) linked to the event, their live lines that name an item.
 */
export async function approvedRentalUnits(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Map<string, number>> {
  const wanted = new Map<string, number>();
  const proposals = await ctx.db
    .query("proposals")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  for (const proposal of proposals) {
    if (
      proposal.tenantId !== event.tenantId ||
      proposal.deletedAt != null ||
      proposal.status !== "accepted"
    )
      continue;
    const lines = await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
      .collect();
    for (const line of lines) {
      if (
        line.tenantId !== event.tenantId ||
        line.deletedAt != null ||
        line.removedAt != null ||
        !line.equipmentId
      )
        continue;
      const units = unitsForLine(line, proposal.guestCount);
      if (!(units > 0)) continue;
      wanted.set(line.equipmentId, (wanted.get(line.equipmentId) ?? 0) + units);
    }
  }
  return wanted;
}

/** Units of each item the event already holds (booked, out or back). */
export async function heldUnits(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Map<string, number>> {
  const held = new Map<string, number>();
  const holds = await ctx.db
    .query("equipmentReservations")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  for (const hold of holds) {
    if (
      hold.tenantId !== event.tenantId ||
      hold.deletedAt != null ||
      !COVERING.has(hold.status)
    )
      continue;
    const key = String(hold.equipmentId);
    held.set(key, (held.get(key) ?? 0) + hold.quantity);
  }
  return held;
}

/** Units of each item an outside vendor brings for the event (any rental
 * line not cancelled that names the item). */
export async function vendorRentedUnits(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<Map<string, number>> {
  const rented = new Map<string, number>();
  const lines = await ctx.db
    .query("rentalOrderLines")
    .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
    .collect();
  for (const line of lines) {
    if (
      line.tenantId !== event.tenantId ||
      line.deletedAt != null ||
      line.status === "cancelled" ||
      !line.equipmentId
    )
      continue;
    const key = String(line.equipmentId);
    rented.set(key, (rented.get(key) ?? 0) + line.quantity);
  }
  return rented;
}

/**
 * Goodshuffle replacement (BE-13 rentals, criterion "no re-entry"): a rental
 * item on the proposal the client accepted is held for the event once the
 * event is booked, so nobody reserves it a second time by hand. Runs on
 * approval and on every later accepted change. It only adds what is missing
 * after our holds and what a vendor brings (a replay adds nothing) and holds
 * only what is free; the rest shows on the
 * event's equipment problems as "approved but not held". It never blocks the
 * approval - an item that cannot be held is a problem to sort out, not a
 * reason to stop the booking.
 */
export async function holdApprovedRentals(
  ctx: MutationCtx,
  eventId: Id<"events">,
): Promise<void> {
  const event = await ctx.db.get(eventId);
  if (!event || event.deletedAt != null) return;
  if (!HOLD_STAGES.has(String(event.stage))) return;
  const startsAt = event.startsAt;
  const endsAt = event.endsAt;
  if (startsAt == null || endsAt == null || endsAt <= startsAt) return;
  const wanted = await approvedRentalUnits(ctx, event);
  if (wanted.size === 0) return;
  const held = await heldUnits(ctx, event);
  const rented = await vendorRentedUnits(ctx, event);
  const now = Date.now();
  for (const [rawId, units] of wanted) {
    const missing =
      units - (held.get(rawId) ?? 0) - (rented.get(rawId) ?? 0);
    if (missing <= 0) continue;
    const equipmentId = ctx.db.normalizeId("equipments", rawId);
    if (!equipmentId) continue;
    const equipment = await ctx.db.get(equipmentId);
    if (
      !equipment ||
      equipment.tenantId !== event.tenantId ||
      equipment.deletedAt != null ||
      equipmentBlock(equipment) !== null
    )
      continue;
    const [reservations, issues] = await Promise.all([
      openHoldsForEquipment(ctx, equipmentId),
      openIssuesForEquipment(ctx, equipmentId),
    ]);
    const free = availableEquipmentQuantity(
      equipment.quantity - unitsOutOfUse(issues, event.tenantId),
      reservations,
      { tenantId: event.tenantId, startsAt, endsAt, now },
    );
    const quantity = Math.min(missing, Math.floor(free));
    if (quantity <= 0) continue;
    await placeEquipmentHold(ctx, {
      tenantId: event.tenantId,
      equipmentId,
      eventId,
      startsAt,
      endsAt,
      quantity,
      overrideReason: null,
    });
  }
}
