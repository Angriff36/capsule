import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
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
 * bindings. ~~Driver assignment after auto-schedule needs a direct patch seam
 * because the schedule reaction does not set driverId.~~
 * 2026-09-29: the write is the generated Delivery.assignDriver /
 * unassignDriver command (caller auth, same transaction), which emits
 * DeliveryDriverAssigned / DeliveryDriverUnassigned. This seam keeps the
 * operator-readable pre-checks and the no-op unassign of an empty slot.
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

    await ctx.runMutation(api.mutations.Delivery_assignDriver, {
      docId: args.deliveryId,
      driverId: args.driverId,
      version: delivery.version,
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

    await ctx.runMutation(api.mutations.Delivery_unassignDriver, {
      docId: args.deliveryId,
      version: delivery.version,
    });

    return { deliveryId: args.deliveryId, driverId: null };
  },
});
