import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

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
 * Authored driver-assignment seam for Delivery.
 *
 * Manifest owns the entity, lifecycle, policies, events, and generated client
 * bindings. Driver assignment after auto-schedule needs a direct patch seam
 * because the schedule reaction does not set driverId.
 */
export const assign = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    driverId: v.id("people"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!DELIVERY_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Logistics or manager access is required to assign drivers.",
      );
    }

    const [delivery, driver] = await Promise.all([
      ctx.db.get(args.deliveryId),
      ctx.db.get(args.driverId),
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
        "Only scheduled or in-transit deliveries can change drivers.",
      );
    }
    if (!driver || driver.tenantId !== tenantId || driver.deletedAt != null) {
      throw new ConvexError("Driver is unavailable in this workspace.");
    }
    if (driver.status !== "active") {
      throw new ConvexError(
        `${driver.givenName} ${driver.familyName} is not an active driver.`,
      );
    }

    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      driverId: args.driverId,
      updatedAt: now,
      version: (delivery.version ?? 0) + 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "DeliveryDriverAssigned",
      entity: "Delivery",
      entityId: args.deliveryId,
      payload: {
        deliveryId: args.deliveryId,
        tenantId,
        driverId: args.driverId,
        eventId: delivery.eventId,
      },
      createdAt: now,
    });

    return { deliveryId: args.deliveryId, driverId: args.driverId };
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
        "Logistics or manager access is required to assign drivers.",
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
        "Only scheduled or in-transit deliveries can change drivers.",
      );
    }
    const driverId = delivery.driverId;
    if (driverId == null) {
      return { deliveryId: args.deliveryId, driverId: null };
    }

    const now = Date.now();
    await ctx.db.patch(args.deliveryId, {
      driverId: null,
      updatedAt: now,
      version: (delivery.version ?? 0) + 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "DeliveryDriverUnassigned",
      entity: "Delivery",
      entityId: args.deliveryId,
      payload: {
        deliveryId: args.deliveryId,
        tenantId,
        driverId,
        eventId: delivery.eventId,
      },
      createdAt: now,
    });

    return { deliveryId: args.deliveryId, driverId: null };
  },
});
