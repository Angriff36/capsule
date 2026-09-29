import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import {
  equipmentQuantityAvailable,
  overbookedMessage,
} from "./lib/equipmentReservationGuard";

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
 * bindings. ~~The current Convex projection cannot hydrate a hasMany overlap
 * guard during governed creation, so this one mutation performs the range read
 * and insert in the same serializable Convex transaction.~~
 * 2026-09-29: the row is created by the generated
 * EquipmentReservation_createViaReserve (caller auth, same transaction), which
 * emits EquipmentReserved. The availability read also runs inside that command
 * transaction (lib/equipmentReservationGuard.ts via lib/operationalEvents.ts);
 * this seam keeps it up front for the operator-readable message.
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
    if (equipment.status !== "active") {
      throw new ConvexError("Only active equipment can be reserved.");
    }
    if (!event || event.tenantId !== tenantId || event.deletedAt != null) {
      throw new ConvexError("Event is unavailable in this workspace.");
    }

    const availableQuantity = await equipmentQuantityAvailable(ctx, {
      equipment,
      tenantId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
    });
    if (args.quantity > availableQuantity) {
      throw new ConvexError(overbookedMessage(equipment, availableQuantity));
    }

    const created = await ctx.runMutation(
      api.mutations.EquipmentReservation_createViaReserve,
      {
        equipmentId: args.equipmentId,
        eventId: args.eventId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        quantity: args.quantity,
      },
    );
    const equipmentReservationId = created.docId as Id<"equipmentReservations">;

    return { equipmentReservationId };
  },
});
