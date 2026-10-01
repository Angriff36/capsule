/**
 * AUTHOR SEAM — hitch a trailer to a truck that is already on an event.
 *
 * A rig's truck, trailer and driver are set when the rig is made and never
 * changed (an update can't check a new id against the caller's workspace).
 * So hitching makes a new rig with the same truck, driver and times plus the
 * trailer, and releases the old one, in one transaction:
 * - the old rig is released first, so the new one is not refused as the
 *   same truck on two runs at once;
 * - the crew riding the old rig and the pack lines loaded on it move to the
 *   new one, so nobody is left riding a released truck;
 * - a reason for a "fix first" item is kept in the same save;
 * - when any step is refused, nothing is kept.
 * Releasing and making the rig, and moving pack lines, are the generated
 * commands (their rules and permissions apply). Moving a rider is part of
 * the same truck change, so it is written here: the crew command asks for a
 * workforce manager, and a logistics planner hitching a trailer is not one.
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

export const hitchTrailer = mutation({
  args: {
    rigId: v.id("eventVehicleAssignments"),
    trailerId: v.id("trailers"),
    /** Set when the board asked why a "fix first" item is fine: kept too. */
    action: v.optional(v.string()),
    reason: v.optional(v.string()),
    openItems: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ rigId: string }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const rig = await ctx.db.get(args.rigId);
    if (
      !rig ||
      rig.tenantId !== tenantId ||
      rig.deletedAt != null ||
      rig.releasedAt != null ||
      rig.activeEventId == null
    )
      throw new ConvexError("This truck is no longer on the event.");
    if (!rig.vehicleId)
      throw new ConvexError("Pick a truck on this event to pull the trailer.");
    if (rig.trailerId)
      throw new ConvexError(
        "This truck already pulls a trailer. Take that trailer off first.",
      );

    await ctx.runMutation(api.mutations.EventVehicleAssignment_release, {
      docId: rig._id,
    });
    const made = (await ctx.runMutation(
      api.mutations.EventVehicleAssignment_createViaAssign,
      {
        eventId: rig.eventId,
        vehicleId: rig.vehicleId,
        trailerId: args.trailerId,
        driverId: rig.driverId ?? undefined,
        notes: rig.notes ?? undefined,
        preloaded: rig.preloadedAt != null ? true : undefined,
        vendorName: rig.vendorName ?? undefined,
        arriveBeforeServeMinutes: rig.arriveBeforeServeMinutes ?? undefined,
        loadMinutes: rig.loadMinutes ?? undefined,
        leaveAfterMinutes: rig.leaveAfterMinutes ?? undefined,
        loadingZone: rig.loadingZone ?? undefined,
      },
    )) as { docId: string };
    const newRigId = made.docId as Id<"eventVehicleAssignments">;
    const now = Date.now();

    for (const table of ["eventAssignments", "eventStaffNeeds"] as const) {
      const riders = await ctx.db
        .query(table)
        .withIndex("by_rideVehicleAssignmentId", (q) =>
          q.eq("rideVehicleAssignmentId", rig._id),
        )
        .collect();
      for (const row of riders)
        if (row.tenantId === tenantId && row.deletedAt == null)
          await ctx.db.patch(row._id, {
            rideVehicleAssignmentId: newRigId,
            updatedAt: now,
            version: (row.version ?? 0) + 1,
          });
    }

    const loaded = await ctx.db
      .query("packListItems")
      .withIndex("by_loadAssignmentId", (q) =>
        q.eq("loadAssignmentId", rig._id),
      )
      .collect();
    for (const line of loaded) {
      if (line.tenantId !== tenantId || line.deletedAt != null) continue;
      // A cancelled list's lines stay as they were.
      const list = await ctx.db.get(line.packListId);
      if (!list || list.status === "cancelled") continue;
      await ctx.runMutation(api.mutations.PackListItem_assignLoad, {
        docId: line._id,
        loadAssignmentId: newRigId,
      });
    }

    if (args.reason?.trim())
      await ctx.runMutation(api.mutations.PlanningOverride_createViaRecord, {
        eventId: rig.eventId,
        action: args.action?.trim() || "Hitch a trailer",
        reason: args.reason,
        openItems: args.openItems,
      });

    return { rigId: newRigId };
  },
});
