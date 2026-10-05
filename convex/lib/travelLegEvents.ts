import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { reconcileEventStaffing } from "./eventStaffingOperations";

const TRAVEL_CHOICES = new Set(["EventAssignmentTravelLegChosen", "EventStaffNeedTravelLegChosen"]);
const RIG_CHANGES = new Set(["EventVehicleAssigned", "EventVehicleLegPlanned", "EventVehicleReleased"]);

/**
 * PL-ROUTE-LEGS follow-up, inside the originating command's transaction. A
 * person may only ride a truck that is on the same event in this workspace
 * (the generated update cannot check a new id). A truck change or a new travel
 * choice re-plans the crew windows that follow it.
 */
export async function handleTravelLegEvent(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<boolean> {
  const travel = TRAVEL_CHOICES.has(event.type);
  if (!travel && !(event.entity === "EventVehicleAssignment" && RIG_CHANGES.has(event.type))) return false;
  const eventId = ctx.db.normalizeId("events", String(event.payload?.eventId ?? ""));
  const tenantId = String(event.payload?.tenantId ?? "");
  if (!eventId) return true;
  if (travel && event.payload?.rideVehicleAssignmentId) {
    const rigId = ctx.db.normalizeId("eventVehicleAssignments", String(event.payload.rideVehicleAssignmentId));
    const rig = rigId ? await ctx.db.get(rigId) : null;
    if (!rig || rig.tenantId !== tenantId || rig.eventId !== eventId || rig.deletedAt != null ||
      rig.releasedAt != null || (rig.vehicleId == null && rig.trailerId == null))
      throw new ConvexError("Pick a truck on this event for this person to ride.");
  }
  const parent = await ctx.db.get(eventId as Id<"events">);
  // A cancelled event's crew is stood down by the cancellation itself.
  if (!parent || parent.tenantId !== tenantId || parent.stage === "cancelled") return true;
  await reconcileEventStaffing(ctx, eventId);
  return true;
}
