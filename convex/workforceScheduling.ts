import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  suggestStaff,
  type SuggestionFacts,
  type SuggestionWork,
} from "../src/lib/staffSuggestions";
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

// Suggestions read everyone's time off and certificates: staffing managers only.
const SUGGESTION_ROLES = new Set([...WORKFORCE_MANAGER_ROLES, "event_manager"]);

async function suggestionContext(ctx: QueryCtx, needId: Id<"eventStaffNeeds">) {
  const auth = await getAuthContext(ctx);
  const tenantId = requireTenant(auth);
  if (
    !SUGGESTION_ROLES.has(auth.role) ||
    auth.disabledCapabilities.includes("workforce")
  )
    throw new ConvexError(
      "Staffing manager access is required to see suggestions.",
    );
  const need = await ctx.db.get(needId);
  if (!need || need.tenantId !== tenantId || need.deletedAt != null)
    throw new ConvexError("Staffing need not found in this workspace.");
  const event = await ctx.db.get(need.eventId);
  if (!event || event.tenantId !== tenantId)
    throw new ConvexError("Staffing need not found in this workspace.");
  const shiftIds = (
    await ctx.db
      .query("shifts")
      .withIndex("by_eventId", (q) => q.eq("eventId", need.eventId))
      .collect()
  )
    .filter((row) => row.eventStaffingSourceIds?.includes(need._id))
    .map((row) => row._id as string);
  const work: SuggestionWork = {
    role: need.role,
    startsAt: need.startsAt ?? event.startsAt ?? null,
    endsAt: need.endsAt ?? event.endsAt ?? null,
    qualificationName: need.qualificationName ?? null,
    certificationType: need.certificationType ?? null,
    places: [event.venueName, need.workLocation].flatMap((row) =>
      row?.trim() ? [row.trim()] : [],
    ),
    ownShiftIds: shiftIds,
  };
  const people = await ctx.db
    .query("people")
    .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
    .collect();
  const facts: SuggestionFacts = {
    shifts: [],
    timeOff: [],
    qualifications: [],
  };
  for (const person of people) {
    if (person.deletedAt != null || person.status !== "active") continue;
    const after = work.startsAt ?? Date.now();
    for (const status of ["scheduled", "started"] as const) {
      const rows = await ctx.db
        .query("shifts")
        .withIndex("by_staff_status_end", (q) =>
          q
            .eq("tenantId", tenantId)
            .eq("personId", person._id)
            .eq("status", status)
            .gt("endsAt", after),
        )
        .collect();
      facts.shifts.push(
        ...rows.map((row) => ({ ...row, personId: row.personId as string })),
      );
    }
    const away = await ctx.db
      .query("timeOffRequests")
      .withIndex("by_staff_status_end", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("personId", person._id)
          .eq("status", "approved")
          .gt("endsAt", after),
      )
      .collect();
    facts.timeOff.push(
      ...away.map((row) => ({ ...row, personId: row.personId as string })),
    );
    const held = await ctx.db
      .query("qualifications")
      .withIndex("by_personId", (q) => q.eq("personId", person._id))
      .collect();
    facts.qualifications.push(
      ...held
        .filter((row) => row.tenantId === tenantId)
        .map((row) => ({ ...row, personId: row.personId as string })),
    );
  }
  const current = need.filledByPersonId ?? need.claimedByPersonId;
  const result = suggestStaff(
    work,
    people
      .filter((row) => row._id !== current)
      .map((row) => ({ ...row, _id: row._id as string })),
    facts,
    Date.now(),
  );
  return { need, result };
}

/** Who can take this staffing need, best first, and why others can't. */
export const suggestStaffForNeed = query({
  args: { needId: v.id("eventStaffNeeds") },
  handler: async (ctx, { needId }) =>
    (await suggestionContext(ctx, needId)).result,
});

/**
 * Fill every open need on an event with its top suggested person (spec §12.2
 * "safe auto-fill"). Only suggested people are used - never anyone on time
 * off, already working, on a do-not-schedule hold, without the certificate,
 * or not approved for the place - and the fill command re-checks time off and
 * certificates. Needs with nobody suitable stay open with the reason.
 */
export const autoFillEventStaffNeeds = mutation({
  args: { eventId: v.id("events") },
  handler: async (ctx, { eventId }) => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    const needs = (
      await ctx.db
        .query("eventStaffNeeds")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .collect()
    )
      .filter(
        (row) =>
          row.tenantId === tenantId &&
          row.deletedAt == null &&
          row.status === "open",
      )
      .sort(
        (a, b) =>
          a.role.localeCompare(b.role) ||
          (a.templateSlot ?? 0) - (b.templateSlot ?? 0),
      );
    const filled: Array<{ needId: string; role: string; name: string }> = [];
    const left: Array<{ needId: string; role: string; reason: string }> = [];
    for (const need of needs) {
      const { result } = await suggestionContext(ctx, need._id);
      const pick = result.suggested[0];
      if (!pick) {
        left.push({
          needId: need._id,
          role: need.role,
          reason: "Nobody suitable is free",
        });
        continue;
      }
      const fresh = (await ctx.db.get(need._id))!;
      await ctx.runMutation(api.mutations.EventStaffNeed_fill, {
        docId: need._id,
        version: fresh.version,
        personId: pick.personId as Id<"people">,
      });
      filled.push({ needId: need._id, role: need.role, name: pick.name });
    }
    return { filled, left };
  },
});
