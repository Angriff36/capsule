import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getAuthContext, requireTenant } from "./authContext";

/** Closing an event frees outstanding holds without undoing consumed stock. */
export async function releaseEventInventoryHolds(
  ctx: MutationCtx,
  eventId: Id<"events">,
) {
  const tenantId = requireTenant(await getAuthContext(ctx));
  const event = await ctx.db.get(eventId);
  if (
    !event ||
    event.tenantId !== tenantId ||
    event.deletedAt != null ||
    !["cancelled", "completed", "closed_out"].includes(event.stage)
  )
    throw new Error("Inventory hold cleanup requires a finished event");

  const reservations = await ctx.db
    .query("inventoryReservations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .collect();
  for (const reservation of reservations) {
    if (
      reservation.tenantId !== tenantId ||
      reservation.deletedAt != null ||
      reservation.status !== "active"
    )
      continue;
    await ctx.runMutation(api.mutations.InventoryReservation_release, {
      docId: reservation._id,
      version: reservation.version,
      reason:
        event.stage === "cancelled"
          ? (event.cancellationReason ?? "Event cancelled")
          : "Event completed",
    });
  }
}
