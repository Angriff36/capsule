// AUTHOR SEAM — personal swap eligibility and the operational details needed
// by a request's participants. Generated reads own authorization; generated
// propose/accept/approve commands remain the only write contract.
import { v } from "convex/values";
import { query } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthContext } from "./lib/authContext";
import { evaluateShiftSwapCandidate } from "../src/features/workforce/shiftSwapEligibility";

type Candidate = {
  personId: Id<"people">;
  name: string;
  targetQualificationId?: string;
  targetTrainingCompletionId?: string;
};

/** Return eligible coworkers, never their private credential or time-off rows. */
export const getCandidates = query({
  args: { shiftId: v.id("shifts"), now: v.number() },
  handler: async (
    ctx,
    { shiftId, now },
  ): Promise<{ candidates: Candidate[]; unavailableReason: string | null }> => {
    const auth = await getAuthContext(ctx);
    const unavailable = {
      candidates: [],
      unavailableReason: "This shift is unavailable for a swap.",
    };
    if (!auth.personId || !auth.tenantId || !Number.isFinite(now))
      return unavailable;
    // Reuse the source-owned read policy, including the workforce switch.
    const shift: Doc<"shifts"> | null = await ctx.runQuery(
      api.queries.getShift,
      { id: shiftId },
    );
    if (
      !shift ||
      shift.tenantId !== auth.tenantId ||
      shift.personId !== auth.personId ||
      shift.deletedAt != null ||
      shift.status !== "scheduled" ||
      shift.startsAt == null ||
      shift.endsAt == null ||
      shift.startsAt <= now
    )
      return unavailable;
    const [sourceQualification, shiftType] = await Promise.all([
      shift.requiredQualificationId
        ? ctx.db.get(shift.requiredQualificationId)
        : null,
      shift.shiftTypeId ? ctx.db.get(shift.shiftTypeId) : null,
    ]);
    if (
      shift.requiredQualificationId &&
      (!sourceQualification ||
        sourceQualification.tenantId !== auth.tenantId ||
        sourceQualification.personId !== shift.personId ||
        sourceQualification.deletedAt != null ||
        sourceQualification.status !== "active")
    )
      return {
        candidates: [],
        unavailableReason:
          "The shift's certification requirement needs a manager's update before a swap.",
      };
    if (
      shift.shiftTypeId &&
      (!shiftType ||
        shiftType.tenantId !== auth.tenantId ||
        shiftType.deletedAt != null ||
        shiftType.status !== "active")
    )
      return {
        candidates: [],
        unavailableReason:
          "The shift type needs a manager's update before a swap.",
      };
    const people = await ctx.db
      .query("people")
      .withIndex("by_tenantId_and_status", (q) =>
        q.eq("tenantId", auth.tenantId).eq("status", "active"),
      )
      .collect();
    const candidates: Candidate[] = [];
    for (const candidate of people) {
      if (
        candidate.deletedAt != null ||
        !candidate.authSubjectId ||
        candidate._id === shift.personId
      )
        continue;
      // Select matching evidence by index, without reading accumulated history.
      // Missing and null expiry both mean a certification has no expiry.
      let qualification: Doc<"qualifications"> | null = null;
      if (sourceQualification) {
        for (const expiry of [undefined, null, shift.endsAt]) {
          qualification = await ctx.db
            .query("qualifications")
            .withIndex("by_staff_certification_expiry", (q) => {
              const prefix = q
                .eq("tenantId", auth.tenantId)
                .eq("personId", candidate._id)
                .eq("status", "active")
                .eq("name", sourceQualification.name);
              return expiry == null
                ? prefix.eq("expiresAt", expiry)
                : prefix.gte("expiresAt", expiry);
            })
            .filter((q) =>
              q.and(
                q.or(
                  q.eq(q.field("deletedAt"), null),
                  q.eq(q.field("deletedAt"), undefined),
                ),
                q.eq(
                  q.field("certificationType"),
                  sourceQualification.certificationType,
                ),
              ),
            )
            .first();
          if (qualification) break;
        }
        if (!qualification) continue;
      }
      const moduleId = shiftType?.requiredTrainingModuleId;
      const training = moduleId
        ? await ctx.db
            .query("trainingCompletions")
            .withIndex("by_staff_training_module", (q) =>
              q
                .eq("tenantId", auth.tenantId)
                .eq("personId", candidate._id)
                .eq("trainingModuleId", moduleId),
            )
            .filter((q) =>
              q.and(
                q.or(
                  q.eq(q.field("deletedAt"), null),
                  q.eq(q.field("deletedAt"), undefined),
                ),
                q.neq(q.field("recordedAt"), null),
                q.neq(q.field("recordedAt"), undefined),
              ),
            )
            .first()
        : null;
      if (moduleId && !training) continue;
      const startsAt = shift.startsAt,
        endsAt = shift.endsAt;
      const [scheduled, started, leave] = await Promise.all([
        ...(["scheduled", "started"] as const).map((status) =>
          ctx.db
            .query("shifts")
            .withIndex("by_staff_status_end", (q) =>
              q
                .eq("tenantId", auth.tenantId)
                .eq("personId", candidate._id)
                .eq("status", status)
                .gt("endsAt", startsAt),
            )
            .filter((q) =>
              q.and(
                q.or(
                  q.eq(q.field("deletedAt"), null),
                  q.eq(q.field("deletedAt"), undefined),
                ),
                q.neq(q.field("startsAt"), null),
                q.neq(q.field("startsAt"), undefined),
                q.lt(q.field("startsAt"), endsAt),
              ),
            )
            .first(),
        ),
        ctx.db
          .query("timeOffRequests")
          .withIndex("by_staff_status_end", (q) =>
            q
              .eq("tenantId", auth.tenantId)
              .eq("personId", candidate._id)
              .eq("status", "approved")
              .gt("endsAt", startsAt),
          )
          .filter((q) =>
            q.and(
              q.or(
                q.eq(q.field("deletedAt"), null),
                q.eq(q.field("deletedAt"), undefined),
              ),
              q.neq(q.field("startsAt"), null),
              q.neq(q.field("startsAt"), undefined),
              q.lt(q.field("startsAt"), endsAt),
            ),
          )
          .first(),
      ]);
      const result = evaluateShiftSwapCandidate({
        candidate,
        shift,
        now,
        shifts: [scheduled, started].filter((row) => row != null),
        timeOffRequests: leave ? [leave] : [],
        qualifications: [sourceQualification, qualification].filter(
          (row) => row != null,
        ),
        trainingCompletions: training ? [training] : [],
        shiftTypes: shiftType ? [shiftType] : [],
      });
      if (result.eligible)
        candidates.push({
          personId: candidate._id,
          name: `${candidate.givenName} ${candidate.familyName}`.trim(),
          ...(result.targetQualificationId
            ? { targetQualificationId: result.targetQualificationId }
            : {}),
          ...(result.targetTrainingCompletionId
            ? { targetTrainingCompletionId: result.targetTrainingCompletionId }
            : {}),
        });
    }
    candidates.sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.personId.localeCompare(b.personId),
    );
    return { candidates, unavailableReason: null };
  },
});

/** Incoming non-event shifts are private, but participants need their window. */
export const listRelatedShifts = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.personId || !auth.tenantId) return [];
    const personId = ctx.db.normalizeId("people", auth.personId);
    if (!personId) return [];
    const requests: Doc<"shiftSwapRequests">[] = await ctx.runQuery(
      api.queries.listShiftSwapRequestByRecipientPersonIdAndStatus,
      { recipientPersonId: personId, status: "pending_recipient" },
    );
    const ids = new Set(
      requests
        .filter(
          (row) =>
            row.tenantId === auth.tenantId &&
            row.deletedAt == null &&
            row.recipientPersonId === auth.personId,
        )
        .map((row) => row.shiftId),
    );
    const shifts = await Promise.all([...ids].map((id) => ctx.db.get(id)));
    return shifts
      .filter(
        (row): row is Doc<"shifts"> =>
          row != null &&
          row.tenantId === auth.tenantId &&
          row.deletedAt == null,
      )
      .map((row) => ({
        _id: row._id,
        personId: row.personId,
        startsAt: row.startsAt ?? null,
        endsAt: row.endsAt ?? null,
        role: row.role ?? null,
        status: row.status,
      }));
  },
});
