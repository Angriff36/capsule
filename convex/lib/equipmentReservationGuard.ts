import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { availableEquipmentQuantity } from "./equipmentReservationAvailability";

/**
 * Pooled-quantity availability for EquipmentReservation (2026-09-29).
 *
 * A window overlap cannot be written as a Manifest aggregate (aggregates match
 * equality predicates only), so the read runs here: up front in the authored
 * reserve seam (convex/equipmentCheckout.ts) for the operator-readable message
 * and in rental reconciliation before a hold moves, and again inside the
 * command transaction on EquipmentReserved / EquipmentReservationRescheduled
 * (lib/operationalEvents.ts), which also covers a direct call to the
 * generated mutations. A throw rolls the whole command back.
 */
export async function equipmentQuantityAvailable(
  ctx: MutationCtx,
  input: {
    equipment: Doc<"equipments">;
    tenantId: string;
    startsAt: number;
    endsAt: number;
    excludeReservationId?: Id<"equipmentReservations">;
  },
): Promise<number> {
  const reservations = await ctx.db
    .query("equipmentReservations")
    .withIndex("by_equipmentId", (query) =>
      query.eq("equipmentId", input.equipment._id),
    )
    .collect();
  return availableEquipmentQuantity(
    input.equipment.quantity,
    reservations.filter((row) => row._id !== input.excludeReservationId),
    { tenantId: input.tenantId, startsAt: input.startsAt, endsAt: input.endsAt },
  );
}

export function overbookedMessage(
  equipment: Doc<"equipments">,
  available: number,
): string {
  return `${equipment.name} has ${Math.max(available, 0)} available for that window. Choose another time or reduce the quantity.`;
}

/** EquipmentReserved / EquipmentReservationRescheduled hook: the hold's
 * quantity must fit the lot on its (new) window, not counting itself. */
export async function validateReservationFits(
  ctx: MutationCtx,
  reservationId: Id<"equipmentReservations">,
): Promise<void> {
  const row = await ctx.db.get(reservationId);
  if (!row || row.deletedAt != null) return;
  if (row.startsAt == null || row.endsAt == null) return;
  const equipment = await ctx.db.get(row.equipmentId);
  if (!equipment || equipment.deletedAt != null) {
    throw new ConvexError("Equipment is unavailable in this workspace.");
  }
  const available = await equipmentQuantityAvailable(ctx, {
    equipment,
    tenantId: row.tenantId,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    excludeReservationId: row._id,
  });
  if (row.quantity > available) {
    throw new ConvexError(overbookedMessage(equipment, available));
  }
}
