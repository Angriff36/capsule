import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  availableEquipmentQuantity,
  equipmentBlock,
  equipmentConflicts,
  type EquipmentConflict,
} from "./lib/equipmentReservationAvailability";
import { reconcileEventPackRules } from "./lib/packRuleReconciliation";

const day = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dayRange(startsAt: number, endsAt: number): string {
  const from = day.format(startsAt);
  const to = day.format(endsAt);
  return from === to ? from : `${from} to ${to}`;
}

/** "Smith wedding, Oct 3, 2 held" - one line per conflicting hold. */
async function describeConflicts(
  ctx: QueryCtx,
  tenantId: string,
  conflicts: EquipmentConflict[],
): Promise<string[]> {
  const lines: string[] = [];
  for (const conflict of conflicts) {
    const event = await ctx.db.get(conflict.eventId as Id<"events">);
    const title =
      event && event.tenantId === tenantId ? event.title : "another event";
    lines.push(
      conflict.overdue
        ? `${title}, still out and late coming back, ${conflict.quantity} held`
        : `${title}, ${dayRange(conflict.startsAt, conflict.endsAt)}, ${conflict.quantity} held`,
    );
  }
  return lines;
}

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
    const block = equipmentBlock(equipment);
    if (block === "retired") {
      throw new ConvexError("Only active equipment can be reserved.");
    }
    // CF-11.4: out-of-service equipment is never newly booked. The way back is
    // to mark it in service again once it is fixed (Equipment.updateCondition).
    if (block === "out_of_service") {
      throw new ConvexError(
        `${equipment.name} is marked out of service, so it can't be booked. Pick other equipment, rent one, or mark it back in service once it is fixed.`,
      );
    }
    if (!event || event.tenantId !== tenantId || event.deletedAt != null) {
      throw new ConvexError("Event is unavailable in this workspace.");
    }

    const now = Date.now();
    const reservations = await ctx.db
      .query("equipmentReservations")
      .withIndex("by_equipmentId", (query) =>
        query.eq("equipmentId", args.equipmentId),
      )
      .collect();
    const window = {
      tenantId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      now,
    };
    const availableQuantity = availableEquipmentQuantity(
      equipment.quantity,
      reservations,
      window,
    );
    if (args.quantity > availableQuantity) {
      // PR10-03: the loser of a race for the last units sees who holds them
      // and when, where the item is kept, and the ways out.
      const held = await describeConflicts(
        ctx,
        tenantId,
        equipmentConflicts(reservations, window),
      );
      const place = equipment.currentLocation ?? equipment.homeLocation;
      throw new ConvexError(
        [
          `${equipment.name} has ${Math.max(availableQuantity, 0)} free for that time and you asked for ${args.quantity}.`,
          held.length > 0 ? `Already booked: ${held.join("; ")}.` : null,
          place ? `Kept at ${place}.` : null,
          "Pick other equipment, move one from another place, rent it from a vendor, or reduce the amount.",
        ]
          .filter(Boolean)
          .join(" "),
      );
    }

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
    // The held item goes on the event's pack list as a pull-sheet line.
    await reconcileEventPackRules(ctx, args.eventId);

    return { equipmentReservationId };
  },
});

/**
 * PL-ASSET-AVAILABILITY (PR10-03, CF-11.3): every active catalog line with how
 * many are free for one event window, what already holds the rest (other
 * events, late returns), its condition and where it is kept. This event's own
 * holds never count against it. The reserve form reads this before booking so
 * a conflict shows its window, amount, place and condition, and the office can
 * pick a replacement from the same list, move one, or rent it.
 */
export const equipmentAvailability = query({
  args: {
    eventId: v.id("events"),
    startsAt: v.number(),
    endsAt: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    if (!EQUIPMENT_ROLES.has(auth.role) && auth.role !== "event_manager") {
      return [];
    }
    const tenantId = auth.tenantId;
    if (
      !Number.isFinite(args.startsAt) ||
      !Number.isFinite(args.endsAt) ||
      args.endsAt <= args.startsAt
    ) {
      return [];
    }
    const [equipment, reservations] = await Promise.all([
      ctx.db
        .query("equipments")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("equipmentReservations")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ]);
    const window = {
      tenantId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      now: Date.now(),
      excludeEventId: String(args.eventId),
    };
    const byItem = new Map<string, typeof reservations>();
    for (const row of reservations) {
      const key = String(row.equipmentId);
      byItem.set(key, [...(byItem.get(key) ?? []), row]);
    }
    const titles = new Map<string, string>();
    const titleOf = async (eventId: string) => {
      if (!titles.has(eventId)) {
        const event = await ctx.db.get(eventId as Id<"events">);
        titles.set(
          eventId,
          event && event.tenantId === tenantId && event.deletedAt == null
            ? event.title
            : "Another event",
        );
      }
      return titles.get(eventId)!;
    };
    const out = [];
    for (const item of equipment) {
      if (item.deletedAt != null || item.status !== "active") continue;
      const holds = byItem.get(String(item._id)) ?? [];
      const conflicts = equipmentConflicts(holds, window);
      const held = conflicts.reduce((sum, row) => sum + row.quantity, 0);
      out.push({
        equipmentId: item._id,
        name: item.name,
        category: item.category,
        ownership: item.ownership,
        condition: item.condition,
        location: item.currentLocation ?? item.homeLocation ?? null,
        quantity: item.quantity,
        free: Math.max(0, item.quantity - held),
        blocked: equipmentBlock(item),
        conflicts: await Promise.all(
          conflicts.map(async (row) => ({
            eventId: row.eventId,
            eventTitle: await titleOf(row.eventId),
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            quantity: row.quantity,
            overdue: row.overdue,
          })),
        ),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * PL-ASSET-CATALOG: the company's vendors by name only, for picking who a
 * rented item comes from. Logistics and inventory staff cannot read the
 * vendor list (it holds contact and payment details); a rental still needs a
 * vendor, so this returns the id and name and nothing else.
 */
export const rentalVendorChoices = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    if (!EQUIPMENT_ROLES.has(auth.role) && auth.role !== "event_manager") {
      return [];
    }
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();
    return vendors
      .filter(
        (vendor) => vendor.deletedAt == null && vendor.status === "active",
      )
      .map((vendor) => ({ vendorId: vendor._id, name: vendor.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});
