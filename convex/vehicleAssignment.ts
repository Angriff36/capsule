import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { conflictingVehicleDeliveries } from "./lib/vehicleDeliveryAvailability";

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
 * bindings. The current Convex projection cannot hydrate an overlap guard
 * across sibling deliveries during a generated command, so this seam performs
 * the vehicle calendar-conflict read and the patch in the same serializable
 * Convex transaction.
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

    const siblingDeliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_vehicleId", (query) =>
        query.eq("vehicleId", args.vehicleId),
      )
      .collect();
    const conflicts = conflictingVehicleDeliveries(siblingDeliveries, {
      tenantId,
      startsAt: delivery.windowStartsAt,
      endsAt: delivery.windowEndsAt,
      excludeDeliveryId: args.deliveryId,
    });
    if (conflicts.length > 0) {
      const clash = conflicts[0];
      const window = `${new Date(clash.windowStartsAt ?? 0).toLocaleString()} → ${new Date(clash.windowEndsAt ?? 0).toLocaleString()}`;
      throw new ConvexError(
        `${vehicle.registration} is already booked for "${clash.destination}" (${window}). Pick another vehicle or adjust the window.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      vehicleId: args.vehicleId,
      updatedAt: now,
      version: (delivery.version ?? 0) + 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "DeliveryVehicleAssigned",
      entity: "Delivery",
      entityId: args.deliveryId,
      payload: {
        deliveryId: args.deliveryId,
        tenantId,
        vehicleId: args.vehicleId,
        eventId: delivery.eventId,
        windowStartsAt: delivery.windowStartsAt,
        windowEndsAt: delivery.windowEndsAt,
      },
      createdAt: now,
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

    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      vehicleId: null,
      updatedAt: now,
      version: (delivery.version ?? 0) + 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "DeliveryVehicleUnassigned",
      entity: "Delivery",
      entityId: args.deliveryId,
      payload: {
        deliveryId: args.deliveryId,
        tenantId,
        vehicleId,
        eventId: delivery.eventId,
      },
      createdAt: now,
    });

    return { deliveryId: args.deliveryId, vehicleId: null };
  },
});
