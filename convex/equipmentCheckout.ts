import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  equipmentBlock,
  equipmentConflicts,
  unitsOutOfUse,
} from "./lib/equipmentReservationAvailability";
import { eventCancellationObligations } from "./lib/eventCancellation";
import { summarizeEquipmentProblems } from "./lib/equipmentReturns";
import { placeEquipmentHold } from "./lib/equipmentHold";
import {
  approvedRentalUnits,
  heldUnits,
  vendorRentedUnits,
} from "./lib/acceptedRentalHolds";
import { openHoldsForTenant } from "./lib/openEquipmentHolds";

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

/** CF-11.4: who may book out-of-service equipment on purpose, with a reason. */
const OVERRIDE_ROLES = new Set([
  "inventory_manager",
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
    /** A manager books out-of-service or in-repair units anyway, and why. */
    overrideReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    // An event manager plans the event and sees what is free (availability
    // below), so they may also hold it. Booking a unit that is out of use
    // stays with the inventory and logistics managers.
    if (!EQUIPMENT_ROLES.has(auth.role) && auth.role !== "event_manager") {
      throw new ConvexError(
        "Inventory, logistics or event manager access is required to reserve equipment.",
      );
    }
    const overrideReason = args.overrideReason?.trim() || null;
    if (overrideReason && !OVERRIDE_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Only an inventory or logistics manager can book equipment that is out of use. Ask a manager, or pick other equipment.",
      );
    }
    return placeEquipmentHold(ctx, {
      tenantId,
      equipmentId: args.equipmentId,
      eventId: args.eventId,
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      quantity: args.quantity,
      overrideReason,
      personId: auth.personId ?? null,
    });
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
    const [equipment, reservations, issues] = await Promise.all([
      ctx.db
        .query("equipments")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      // Only open holds can take units; returned and cancelled ones never.
      openHoldsForTenant(ctx, tenantId),
      // Only open problems hold units out of use.
      ctx.db
        .query("equipmentIssues")
        .withIndex("by_tenantId_and_status", (q) =>
          q.eq("tenantId", tenantId).eq("status", "open"),
        )
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
      const outOfUse = unitsOutOfUse(
        issues.filter((issue) => issue.equipmentId === item._id),
        tenantId,
      );
      out.push({
        equipmentId: item._id,
        name: item.name,
        category: item.category,
        ownership: item.ownership,
        condition: item.condition,
        location: item.currentLocation ?? item.homeLocation ?? null,
        quantity: item.quantity,
        free: Math.max(0, item.quantity - outOfUse - held),
        outOfUse,
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

function canReadEquipmentExceptions(role: string): boolean {
  return (
    EQUIPMENT_ROLES.has(role) ||
    role === "event_manager" ||
    role === "finance_staff" ||
    role === "manager" ||
    role.endsWith("_manager")
  );
}

/**
 * PL-RETURNS (spec §13.3, AC-551): an event's equipment problems for the
 * closeout and the bill - broken, missing, dirty, late and short vendor
 * returns - with who pays and the money each side owes. Late returns are read
 * from the return times, not stored. A cancelled event also lists what it
 * still owes (a truck that went out, gear still out, open vendor rentals).
 */
export const eventEquipmentExceptions = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canReadEquipmentExceptions(auth.role)) return null;
    const tenantId = auth.tenantId;
    const event = await ctx.db.get(args.eventId);
    if (!event || event.tenantId !== tenantId || event.deletedAt != null)
      return null;
    const eventId = String(args.eventId);
    const [issues, holds, rentals] = await Promise.all([
      ctx.db
        .query("equipmentIssues")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("equipmentReservations")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect(),
      ctx.db
        .query("rentalOrderLines")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .collect(),
    ]);
    const names = new Map<string, string>();
    const nameOf = async (equipmentId: string | null | undefined) => {
      if (!equipmentId) return null;
      if (!names.has(equipmentId)) {
        const row = await ctx.db.get(equipmentId as Id<"equipments">);
        names.set(
          equipmentId,
          row && row.tenantId === tenantId ? row.name : "Equipment",
        );
      }
      return names.get(equipmentId)!;
    };
    const problems = [];
    for (const issue of issues) {
      if (issue.tenantId !== tenantId || issue.deletedAt != null) continue;
      problems.push({
        issueId: issue._id,
        version: issue.version,
        kind: issue.kind,
        description: issue.description,
        equipmentName: await nameOf(issue.equipmentId),
        quantity: issue.quantity,
        holdsUnits: issue.holdsUnits,
        status: issue.status,
        payer: issue.payer,
        cost: issue.cost ?? null,
        chargeAmount: issue.chargeAmount ?? null,
        resolution: issue.resolution ?? null,
      });
    }
    const late = [];
    for (const hold of holds) {
      if (hold.tenantId !== tenantId || hold.deletedAt != null) continue;
      const due = hold.endsAt ?? null;
      const back = hold.returnedAt ?? null;
      const now = Date.now();
      if (due == null) continue;
      if (hold.status === "returned" && back != null && back > due) {
        late.push({
          recordId: String(hold._id),
          name: (await nameOf(hold.equipmentId)) ?? "Equipment",
          quantity: hold.quantity,
          dueAt: due,
          returnedAt: back,
          stillOut: false,
          fromVendor: false,
        });
      } else if (hold.status === "checked_out" && now > due) {
        late.push({
          recordId: String(hold._id),
          name: (await nameOf(hold.equipmentId)) ?? "Equipment",
          quantity: hold.quantity,
          dueAt: due,
          returnedAt: null,
          stillOut: true,
          fromVendor: false,
        });
      }
    }
    for (const line of rentals) {
      if (line.tenantId !== tenantId || line.deletedAt != null) continue;
      const due = line.pickupAt ?? null;
      if (due == null || line.returnedAt == null || line.returnedAt <= due)
        continue;
      late.push({
        recordId: String(line._id),
        name: line.description,
        quantity: line.returnedQuantity ?? line.quantity,
        dueAt: due,
        returnedAt: line.returnedAt,
        stillOut: false,
        fromVendor: true,
      });
    }
    const obligations =
      event.stage === "cancelled"
        ? await eventCancellationObligations(ctx, tenantId, args.eventId)
        : [];
    // Rental items the client approved that the event does not hold in full.
    const notHeld = [];
    if (event.stage !== "cancelled") {
      const held = await heldUnits(ctx, event);
      const rented = await vendorRentedUnits(ctx, event);
      for (const [itemId, approved] of await approvedRentalUnits(ctx, event)) {
        const have = held.get(itemId) ?? 0;
        const fromVendor = rented.get(itemId) ?? 0;
        if (have + fromVendor >= approved) continue;
        notHeld.push({
          equipmentId: itemId,
          name: (await nameOf(itemId)) ?? "Equipment",
          approved,
          held: have,
          fromVendor,
        });
      }
    }
    return {
      problems,
      late,
      obligations,
      notHeld,
      totals: summarizeEquipmentProblems(problems),
    };
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
