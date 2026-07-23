import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { availableEquipmentQuantity } from "./lib/equipmentReservationAvailability";

const EQUIPMENT_ROLES = new Set([
  "inventory_staff",
  "procurement_staff",
  "inventory_manager",
  "logistics_staff",
  "driver",
  "logistics_manager",
  "admin",
  "owner",
  "system",
]);

/**
 * Authored atomic creation seam for EquipmentReservation.
 *
 * Manifest owns the entity, lifecycle, policies, events, and generated client
 * bindings. The current Convex projection cannot hydrate a hasMany overlap
 * guard during governed creation, so this one mutation performs the range read
 * and insert in the same serializable Convex transaction.
 */
export const reserve = mutation({
  args: {
    equipmentId: v.id("equipments"),
    eventId: v.id("events"),
    startsAt: v.number(),
    endsAt: v.number(),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!EQUIPMENT_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Inventory or logistics access is required to reserve equipment.",
      );
    }
    if (
      !Number.isFinite(args.startsAt) ||
      !Number.isFinite(args.endsAt) ||
      args.endsAt <= args.startsAt
    ) {
      throw new ConvexError("Return time must be after checkout time.");
    }
    if (!Number.isSafeInteger(args.quantity) || args.quantity <= 0) {
      throw new ConvexError(
        "Reserved quantity must be a positive whole number.",
      );
    }

    const [equipment, event] = await Promise.all([
      ctx.db.get(args.equipmentId),
      ctx.db.get(args.eventId),
    ]);
    if (
      !equipment ||
      equipment.tenantId !== tenantId ||
      equipment.deletedAt != null
    ) {
      throw new ConvexError("Equipment is unavailable in this workspace.");
    }
    if (equipment.status !== "active" || equipment.registeredAt == null) {
      throw new ConvexError(
        "Only active, registered equipment can be reserved.",
      );
    }
    if (!event || event.tenantId !== tenantId || event.deletedAt != null) {
      throw new ConvexError("Event is unavailable in this workspace.");
    }

    const reservations = await ctx.db
      .query("equipmentReservations")
      .withIndex("by_equipmentId", (query) =>
        query.eq("equipmentId", args.equipmentId),
      )
      .collect();
    const availableQuantity = availableEquipmentQuantity(
      equipment.quantity,
      reservations,
      { tenantId, startsAt: args.startsAt, endsAt: args.endsAt },
    );
    if (args.quantity > availableQuantity) {
      throw new ConvexError(
        `${equipment.name} has ${Math.max(availableQuantity, 0)} available for that window. Choose another time or reduce the quantity.`,
      );
    }

    const now = Date.now();
    const equipmentReservationId = await ctx.db.insert(
      "equipmentReservations",
      {
        tenantId,
        equipmentId: args.equipmentId,
        eventId: args.eventId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        quantity: args.quantity,
        status: "reserved",
        reservedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 0,
      },
    );
    await ctx.db.insert("manifestEvents", {
      type: "EquipmentReserved",
      entity: "EquipmentReservation",
      entityId: equipmentReservationId,
      payload: {
        equipmentReservationId,
        equipmentId: args.equipmentId,
        eventId: args.eventId,
        tenantId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        quantity: args.quantity,
      },
      createdAt: now,
    });

    return { equipmentReservationId };
  },
});
