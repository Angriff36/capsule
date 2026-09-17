import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { orgCapabilityDeniesAction } from "./lib/orgCapabilityGate";

const WORKFORCE_MANAGER_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

/**
 * Compatibility entry for manual scheduling and one-per-event timeline sync.
 * Generated Shift.schedule owns validation, encryption, events and writes.
 * Its transactional callback checks approved time off for every entry path.
 */
export const scheduleShift = mutation({
  args: {
    personId: v.id("people"),
    startsAt: v.number(),
    endsAt: v.number(),
    eventId: v.optional(v.id("events")),
    role: v.optional(v.string()),
    shiftTypeId: v.optional(v.id("shiftTypes")),
    requiredQualificationId: v.optional(v.id("qualifications")),
    requiredTrainingCompletionId: v.optional(v.id("trainingCompletions")),
    notes: v.optional(v.string()),
    /**
     * Timeline sync: return the person's existing live shift on this event
     * instead of adding one. Manual scheduling (split or multi-day shifts)
     * leaves this off and always inserts.
     */
    onePerEvent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (
      !WORKFORCE_MANAGER_ROLES.has(auth.role) ||
      orgCapabilityDeniesAction(
        "workforceManageAccess",
        auth.disabledCapabilities,
      )
    ) {
      throw new ConvexError(
        "Workforce manager access is required to schedule shifts.",
      );
    }
    // One live shift per person per event: a retried or concurrent call for
    // the same event returns the shift that already exists instead of adding
    // a second one to schedules, publication counts and utilization.
    if (args.onePerEvent && args.eventId) {
      const existing = (
        await ctx.db
          .query("shifts")
          .withIndex("by_personId", (query) =>
            query.eq("personId", args.personId),
          )
          .collect()
      ).find(
        (shift) =>
          shift.tenantId === tenantId &&
          shift.eventId === args.eventId &&
          shift.deletedAt == null &&
          // completed and no_show are attendance history, not a gap
          shift.status !== "cancelled",
      );
      if (existing) return { docId: existing._id, existing: true };
    }

    const { onePerEvent: _onePerEvent, ...scheduleArgs } = args;
    const created: { docId: string } = await ctx.runMutation(
      api.mutations.Shift_createViaSchedule,
      { ...scheduleArgs, notes: args.notes?.trim() || undefined },
    );
    return { docId: created.docId, existing: false };
  },
});
