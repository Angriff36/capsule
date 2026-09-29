import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { assertVehicleWindowFree } from "./lib/vehicleAssignmentGuard";

// Delivery write policy: logisticsAccess or manageAccess (base.manifest roles).
const DELIVERY_ROLES = new Set([
  "logistics_staff",
  "driver",
  "logistics_manager",
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "workforce_manager",
  "finance_manager",
  "admin",
  "owner",
  "system",
]);

/**
 * Authored vehicle-assignment seam for Delivery.
 *
 * Manifest owns the entity, lifecycle, policies, events, and generated client
 * bindings. ~~The current Convex projection cannot hydrate an overlap guard
 * across sibling deliveries during a generated command, so this seam performs
 * the vehicle calendar-conflict read and the patch in the same serializable
 * Convex transaction.~~
 * 2026-09-29: the write is the generated Delivery.assignVehicle /
 * unassignVehicle command (caller auth, same transaction), which emits
 * DeliveryVehicleAssigned / DeliveryVehicleUnassigned. The calendar-conflict
 * check also runs inside that command transaction on DeliveryVehicleAssigned
 * (lib/vehicleAssignmentGuard.ts), so a direct call to the generated mutation
 * cannot double-book; this seam keeps the same read up front for the
 * operator-readable message.
 */
export const assign = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    vehicleId: v.id("vehicles"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!DELIVERY_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Logistics or manager access is required to assign vehicles.",
      );
    }

    const [delivery, vehicle] = await Promise.all([
      ctx.db.get(args.deliveryId),
      ctx.db.get(args.vehicleId),
    ]);
    if (
      !delivery ||
      delivery.tenantId !== tenantId ||
      delivery.deletedAt != null
    ) {
      throw new ConvexError("Delivery is unavailable in this workspace.");
    }
    if (args.version !== undefined && delivery.version !== args.version) {
      throw new ConvexError(
        `ConcurrencyConflict: VERSION_MISMATCH expected ${args.version} actual ${delivery.version}`,
      );
    }
    if (delivery.status !== "scheduled" && delivery.status !== "in_transit") {
      throw new ConvexError(
        "Only scheduled or in-transit deliveries can change vehicles.",
      );
    }
    if (delivery.windowStartsAt == null || delivery.windowEndsAt == null) {
      throw new ConvexError(
        "Set the delivery window before assigning a vehicle.",
      );
    }
    if (
      !vehicle ||
      vehicle.tenantId !== tenantId ||
      vehicle.deletedAt != null
    ) {
      throw new ConvexError("Vehicle is unavailable in this workspace.");
    }
    if (vehicle.operationalStatus === "retired") {
      throw new ConvexError(
        `${vehicle.registration} is retired and cannot take deliveries.`,
      );
    }

    await assertVehicleWindowFree(ctx, {
      tenantId,
      deliveryId: args.deliveryId,
      vehicle,
      startsAt: delivery.windowStartsAt,
      endsAt: delivery.windowEndsAt,
    });

    await ctx.runMutation(api.mutations.Delivery_assignVehicle, {
      docId: args.deliveryId,
      vehicleId: args.vehicleId,
      version: delivery.version,
    });

    return { deliveryId: args.deliveryId, vehicleId: args.vehicleId };
  },
});

export const unassign = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!DELIVERY_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Logistics or manager access is required to assign vehicles.",
      );
    }

    const delivery = await ctx.db.get(args.deliveryId);
    if (
      !delivery ||
      delivery.tenantId !== tenantId ||
      delivery.deletedAt != null
    ) {
      throw new ConvexError("Delivery is unavailable in this workspace.");
    }
    if (args.version !== undefined && delivery.version !== args.version) {
      throw new ConvexError(
        `ConcurrencyConflict: VERSION_MISMATCH expected ${args.version} actual ${delivery.version}`,
      );
    }
    if (delivery.status !== "scheduled" && delivery.status !== "in_transit") {
      throw new ConvexError(
        "Only scheduled or in-transit deliveries can change vehicles.",
      );
    }
    const vehicleId = delivery.vehicleId;
    if (vehicleId == null) {
      return { deliveryId: args.deliveryId, vehicleId: null };
    }

    await ctx.runMutation(api.mutations.Delivery_unassignVehicle, {
      docId: args.deliveryId,
      version: delivery.version,
    });

    return { deliveryId: args.deliveryId, vehicleId: null };
  },
});
