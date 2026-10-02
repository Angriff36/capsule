/**
 * AUTHOR SEAM — hitch a trailer to a truck that is already on an event, and
 * keep the planner's reason for a "fix first" item, in one save.
 *
 * The hitch is the generated EventVehicleAssignment.attachTrailer command on
 * the same rig: it checks the trailer belongs to the caller's workspace, runs
 * the same checks as a new rig (in service, fits the truck, not on another
 * run at the same time unless a reason is given) and plans the crew's times
 * again. The rig keeps its riders, its loaded pack lines and its preload
 * record. The reason is PlanningOverride.record. When either is refused,
 * nothing is kept.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";

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
    const reason = args.reason?.trim() || undefined;
    await ctx.runMutation(api.mutations.EventVehicleAssignment_attachTrailer, {
      docId: args.rigId,
      trailerId: args.trailerId,
      bookedTwiceReason: reason,
    });
    if (reason) {
      const rig = await ctx.db.get(args.rigId);
      if (rig)
        await ctx.runMutation(api.mutations.PlanningOverride_createViaRecord, {
          eventId: rig.eventId,
          action: args.action?.trim() || "Hitch a trailer",
          reason,
          openItems: args.openItems,
        });
    }
    return { rigId: args.rigId };
  },
});
