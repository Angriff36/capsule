import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { conflictingVehicleDeliveries } from "./vehicleDeliveryAvailability";

/**
 * Vehicle calendar-conflict check for Delivery.assignVehicle (2026-09-29).
 *
 * A window overlap across sibling deliveries cannot be written as a Manifest
 * aggregate (aggregates match equality predicates only), so it runs here:
 * up front in the authored seam (convex/vehicleAssignment.ts) for the
 * operator-readable message, and again inside the command transaction on
 * DeliveryVehicleAssigned (lib/operationalEvents.ts), which also covers a
 * direct call to the generated Delivery_assignVehicle mutation. A throw rolls
 * the whole command back.
 */
export async function assertVehicleWindowFree(
  ctx: MutationCtx,
  input: {
    tenantId: string;
    deliveryId: Id<"deliveries">;
    vehicle: Doc<"vehicles">;
    startsAt: number;
    endsAt: number;
  },
): Promise<void> {
  const siblingDeliveries = await ctx.db
    .query("deliveries")
    .withIndex("by_vehicleId", (query) =>
      query.eq("vehicleId", input.vehicle._id),
    )
    .collect();
  const conflicts = conflictingVehicleDeliveries(siblingDeliveries, {
    tenantId: input.tenantId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    excludeDeliveryId: input.deliveryId,
  });
  if (conflicts.length > 0) {
    const clash = conflicts[0];
    const window = `${new Date(clash.windowStartsAt ?? 0).toLocaleString()} → ${new Date(clash.windowEndsAt ?? 0).toLocaleString()}`;
    throw new ConvexError(
      `${input.vehicle.registration} is already booked for "${clash.destination}" (${window}). Pick another vehicle or adjust the window.`,
    );
  }
}

/** DeliveryVehicleAssigned hook: the just-assigned vehicle must be free. */
export async function validateAssignedVehicle(
  ctx: MutationCtx,
  deliveryId: Id<"deliveries">,
): Promise<void> {
  const delivery = await ctx.db.get(deliveryId);
  if (!delivery || delivery.vehicleId == null) return;
  const vehicle = await ctx.db.get(delivery.vehicleId);
  if (!vehicle) {
    throw new ConvexError("Vehicle is unavailable in this workspace.");
  }
  if (delivery.windowStartsAt == null || delivery.windowEndsAt == null) {
    throw new ConvexError(
      "Set the delivery window before assigning a vehicle.",
    );
  }
  await assertVehicleWindowFree(ctx, {
    tenantId: delivery.tenantId,
    deliveryId,
    vehicle,
    startsAt: delivery.windowStartsAt,
    endsAt: delivery.windowEndsAt,
  });
}
