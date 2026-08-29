import { ConvexError, v } from "convex/values";
import { findApprovedTimeOffConflict } from "../src/lib/timeOff";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { encrypt } from "./lib/encryption";

const WORKFORCE_MANAGER_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

/**
 * Authored atomic creation seam for Shift.
 *
 * Manifest owns Shift.schedule and its generated lifecycle. The current Convex
 * projection cannot hydrate a person's hasMany time-off rows during governed
 * creation, so this mutation mirrors schedule validation and performs the
 * approved-range read plus insert in one serializable transaction.
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
    if (!WORKFORCE_MANAGER_ROLES.has(auth.role)) {
      throw new ConvexError(
        "Workforce manager access is required to schedule shifts.",
      );
    }
    if (
      !Number.isFinite(args.startsAt) ||
      !Number.isFinite(args.endsAt) ||
      args.endsAt <= args.startsAt
    ) {
      throw new ConvexError("Shift end must be after its start.");
    }

    const [person, event, shiftType, qualification, trainingCompletion] =
      await Promise.all([
        ctx.db.get(args.personId),
        args.eventId ? ctx.db.get(args.eventId) : null,
        args.shiftTypeId ? ctx.db.get(args.shiftTypeId) : null,
        args.requiredQualificationId
          ? ctx.db.get(args.requiredQualificationId)
          : null,
        args.requiredTrainingCompletionId
          ? ctx.db.get(args.requiredTrainingCompletionId)
          : null,
      ]);

    if (
      !person ||
      person.tenantId !== tenantId ||
      person.deletedAt != null ||
      person.status !== "active"
    ) {
      throw new ConvexError("Select an active staff member in this workspace.");
    }
    if (
      args.eventId &&
      (!event || event.tenantId !== tenantId || event.deletedAt != null)
    ) {
      throw new ConvexError("Select an event in this workspace.");
    }
    if (
      args.shiftTypeId &&
      (!shiftType ||
        shiftType.tenantId !== tenantId ||
        shiftType.deletedAt != null ||
        shiftType.status !== "active")
    ) {
      throw new ConvexError("Selected shift type must be active.");
    }
    if (shiftType?.requiredTrainingModuleId) {
      if (
        !trainingCompletion ||
        trainingCompletion.tenantId !== tenantId ||
        trainingCompletion.deletedAt != null ||
        trainingCompletion.recordedAt == null ||
        trainingCompletion.personId !== args.personId ||
        trainingCompletion.trainingModuleId !==
          shiftType.requiredTrainingModuleId
      ) {
        throw new ConvexError(
          "This staff member must complete the shift type's required training first.",
        );
      }
    } else if (args.requiredTrainingCompletionId) {
      throw new ConvexError(
        "Training proof can only be attached to a shift type that requires it.",
      );
    }
    if (args.requiredQualificationId) {
      if (
        !qualification ||
        qualification.tenantId !== tenantId ||
        qualification.deletedAt != null ||
        qualification.status !== "active" ||
        qualification.personId !== args.personId
      ) {
        throw new ConvexError(
          "Required certification must be active and belong to this staff member.",
        );
      }
      if (
        qualification.expiresAt != null &&
        qualification.expiresAt < args.endsAt
      ) {
        throw new ConvexError(
          "Required certification must remain valid through the shift.",
        );
      }
    }

    const timeOffRequests = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_personId", (query) => query.eq("personId", args.personId))
      .collect();
    if (
      findApprovedTimeOffConflict(timeOffRequests, {
        personId: args.personId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
      })
    ) {
      throw new ConvexError(
        "This shift overlaps approved time off. Choose another staff member or adjust the shift.",
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
          shift.status !== "cancelled" &&
          shift.status !== "no_show",
      );
      if (existing) return { docId: existing._id, existing: true };
    }

    const now = Date.now();
    const notes = args.notes?.trim();
    let encryptedNotes: string | undefined;
    if (notes) {
      const encrypted = await encrypt(notes, {
        ctx,
        entity: "Shift",
        property: "notes",
      });
      encryptedNotes = JSON.stringify({
        v: 1,
        kid: encrypted.keyId,
        ct: encrypted.ciphertext,
      });
    }

    const shiftId = await ctx.db.insert("shifts", {
      tenantId,
      personId: args.personId,
      ...(args.eventId ? { eventId: args.eventId } : {}),
      startsAt: args.startsAt,
      endsAt: args.endsAt,
      ...(args.role ? { role: args.role } : {}),
      ...(args.shiftTypeId ? { shiftTypeId: args.shiftTypeId } : {}),
      ...(args.requiredQualificationId
        ? { requiredQualificationId: args.requiredQualificationId }
        : {}),
      ...(args.requiredTrainingCompletionId
        ? {
            requiredTrainingCompletionId: args.requiredTrainingCompletionId,
          }
        : {}),
      ...(encryptedNotes ? { notes: encryptedNotes } : {}),
      status: "scheduled",
      scheduledAt: now,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "ShiftScheduled",
      entity: "Shift",
      entityId: shiftId,
      payload: {
        shiftId,
        tenantId,
        personId: args.personId,
        eventId: args.eventId,
        startsAt: args.startsAt,
        endsAt: args.endsAt,
        role: args.role,
        shiftTypeId: args.shiftTypeId,
        requiredQualificationId: args.requiredQualificationId,
        requiredTrainingCompletionId: args.requiredTrainingCompletionId,
        status: "scheduled",
      },
      createdAt: now,
    });

    return { docId: shiftId, existing: false };
  },
});
