import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  availableEquipmentQuantity,
  equipmentBlock,
  equipmentConflicts,
  unitsOutOfUse,
  type EquipmentConflict,
} from "./equipmentReservationAvailability";
import { reconcileEventPackRules } from "./packRuleReconciliation";
import { insertStepEvent } from "./commandAudit";
import { openHoldsForEquipment, openIssuesForEquipment } from "./openEquipmentHolds";

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

export type EquipmentHoldRequest = {
  tenantId: string;
  equipmentId: Id<"equipments">;
  eventId: Id<"events">;
  startsAt: number;
  endsAt: number;
  quantity: number;
  /** A manager books out-of-service or in-repair units anyway, and why. */
  overrideReason: string | null;
  /** Who approved the override, when a person did. */
  personId?: string | null;
};

/**
 * One equipment hold for one event window. Every check runs before the first
 * write, so a refused hold leaves nothing behind. Who may hold is the
 * caller's check: the reserve form checks the signed-in role, the booking
 * follow-through runs as the company itself.
 */
export async function placeEquipmentHold(
  ctx: MutationCtx,
  request: EquipmentHoldRequest,
): Promise<{ equipmentReservationId: Id<"equipmentReservations"> }> {
  const { tenantId, overrideReason } = request;
  if (
    !Number.isFinite(request.startsAt) ||
    !Number.isFinite(request.endsAt) ||
    request.endsAt <= request.startsAt
  ) {
    throw new ConvexError("Return time must be after checkout time.");
  }
  if (!Number.isSafeInteger(request.quantity) || request.quantity <= 0) {
    throw new ConvexError("Reserved quantity must be a positive whole number.");
  }

  const [equipment, event] = await Promise.all([
    ctx.db.get(request.equipmentId),
    ctx.db.get(request.eventId),
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
  if (block === "out_of_service" && !overrideReason) {
    throw new ConvexError(
      `${equipment.name} is marked out of service, so it can't be booked. Pick other equipment, rent one, mark it back in service once it is fixed, or have a manager book it anyway with a reason.`,
    );
  }
  if (!event || event.tenantId !== tenantId || event.deletedAt != null) {
    throw new ConvexError("Event is unavailable in this workspace.");
  }

  const now = Date.now();
  const [reservations, issues] = await Promise.all([
    openHoldsForEquipment(ctx, request.equipmentId),
    openIssuesForEquipment(ctx, request.equipmentId),
  ]);
  const window = {
    tenantId,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    now,
  };
  // PL-RETURNS: broken, dirty or in-repair units are not free to book. A
  // manager's override puts them back in reach; other events' holds never.
  const outOfUse = overrideReason ? 0 : unitsOutOfUse(issues, tenantId);
  const availableQuantity = availableEquipmentQuantity(
    equipment.quantity - outOfUse,
    reservations,
    window,
  );
  if (request.quantity > availableQuantity) {
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
        `${equipment.name} has ${Math.max(availableQuantity, 0)} free for that time and you asked for ${request.quantity}.`,
        held.length > 0 ? `Already booked: ${held.join("; ")}.` : null,
        outOfUse > 0
          ? `${outOfUse} out of use (broken, being cleaned or in repair).`
          : null,
        place ? `Kept at ${place}.` : null,
        "Pick other equipment, move one from another place, rent it from a vendor, or reduce the amount.",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const equipmentReservationId = await ctx.db.insert("equipmentReservations", {
    tenantId,
    equipmentId: request.equipmentId,
    eventId: request.eventId,
    startsAt: request.startsAt,
    endsAt: request.endsAt,
    quantity: request.quantity,
    status: "reserved",
    reservedAt: now,
    ...(overrideReason
      ? {
          overrideReason,
          ...(request.personId
            ? { overrideApprovedById: request.personId }
            : {}),
        }
      : {}),
    createdAt: now,
    updatedAt: now,
    version: 0,
  });
  await insertStepEvent(ctx, {
    type: "EquipmentReserved",
    entity: "EquipmentReservation",
    entityId: equipmentReservationId,
    payload: {
      equipmentReservationId,
      equipmentId: request.equipmentId,
      eventId: request.eventId,
      tenantId,
      startsAt: request.startsAt,
      endsAt: request.endsAt,
      quantity: request.quantity,
      ...(overrideReason ? { overrideReason } : {}),
    },
    createdAt: now,
  });
  // The held item goes on the event's pack list as a pull-sheet line.
  await reconcileEventPackRules(ctx, request.eventId);

  return { equipmentReservationId };
}
