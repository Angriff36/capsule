// AUTHOR SEAM — idempotent KM interview-tool ingest (spec §9.3).
//
// The generated Candidate/Interview commands create ONE record at a time and
// cannot upsert. Spec §9.3 requires "re-importing the same candidate/interview
// updates the source-linked records without duplication." This mutation does
// the find-or-upsert loop the generated commands can't:
//
//   - parse the pasted KM JSON (kmParser — every record carries an external id;
//     id-less records get a deterministic synth id so re-import still dedupes),
//   - for each candidate: find an existing Candidate by (sourceSystem,
//     externalCandidateId); if absent, create via Candidate_createViaApply
//     (deterministic idempotencyKey as a 2nd dedup layer) and apply the
//     KM-mapped stage (hire/reject/advance); if present, patch the KM-owned
//     fields (raw + name + role + contact — stage stays an operator decision),
//   - for each interview under that candidate: upsert by externalInterviewId
//     (deduped within the payload); a KM outcome is recorded via
//     Interview_recordOutcome when the interview is still pending.
//
// Source IDs + raw responses live on the Candidate/Interview rows themselves
// (not ExternalRecordLink) — candidates/interviews ARE the Capsule records, so
// there is nothing to reconcile-match against (unlike the TPP payment/event
// imports). The ingest is gated at the workforceManageAccess tier — the EXACT
// roles base.manifest grants it (workforce_manager/admin/owner/system), NOT the
// wider manager tier — so the direct ctx.db.patch update path cannot widen
// access beyond the entities' own policy. The generated create commands
// re-check via getAuthContext too (two layers). Auth propagates through
// ctx.runMutation (same identity), as it does for importCommit.
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import { parseKmCandidates } from "./kmParser";
import type { Doc, Id } from "./_generated/dataModel";

// EXACT mirror of the roles granted `workforceManageAccess` in
// src/foundation/base.manifest (workforce_manager + admin/owner/system via
// `extends`). base `manager` and the other *_manager roles do NOT receive it,
// so they MUST be absent here — otherwise the direct ctx.db.patch update path
// would let non-HR managers overwrite HR data. checkRole is generated as a
// non-exported local, so the seam re-checks the same set. Keep in sync with
// base.manifest.
const WORKFORCE_MANAGE_ROLES = new Set([
  "workforce_manager",
  "admin",
  "owner",
  "system",
]);

const KM_SOURCE = "km_interview";

export const ingestKmCandidates = mutation({
  args: { json: v.string() },
  handler: async (ctx, { json }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !WORKFORCE_MANAGE_ROLES.has(auth.role)) {
      throw new ConvexError("Not authorized to ingest hiring candidates.");
    }

    const { candidates } = parseKmCandidates(json);
    let created = 0;
    let updated = 0;
    let interviewsCreated = 0;
    let interviewsUpdated = 0;

    // ponytail: no by_source index exists, so collect the tenant's candidates
    // once and match in JS — single-tenant scale, the same shape as the
    // generated listCandidateByTenantId the page already uses.
    const tenantCandidates = await ctx.db
      .query("candidates")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();

    for (const candidate of candidates) {
      const externalId = candidate.externalCandidateId;
      const existing = tenantCandidates.find(
        (row) =>
          row.deletedAt == null &&
          row.sourceSystem === KM_SOURCE &&
          row.externalCandidateId === externalId,
      );
      let candidateId: Id<"candidates">;

      if (existing) {
        // Re-import: KM is source of truth for identity/raw/contact. Stage is
        // an operator decision (left untouched; the raw preserves the KM stage).
        await ctx.db.patch(existing._id, {
          fullName: candidate.fullName,
          // mapKmRole guarantees a valid CapsuleRole literal; cast past the
          // strict enum field type (the create hook uses v.any(), the patch
          // path type-checks against the doc's union).
          roleAppliedFor:
            candidate.roleAppliedFor as Doc<"candidates">["roleAppliedFor"],
          rawSourceData: candidate.raw,
          email: candidate.email ?? existing.email ?? undefined,
          phone: candidate.phone ?? existing.phone ?? undefined,
          updatedAt: Date.now(),
          version: (existing.version ?? 0) + 1,
        });
        updated += 1;
        candidateId = existing._id;
      } else {
        const result = await ctx.runMutation(
          api.mutations.Candidate_createViaApply,
          {
            fullName: candidate.fullName,
            email: candidate.email ?? undefined,
            phone: candidate.phone ?? undefined,
            roleAppliedFor: candidate.roleAppliedFor,
            sourceSystem: KM_SOURCE,
            externalCandidateId: externalId,
            rawSourceData: candidate.raw,
            idempotencyKey: `km:${auth.tenantId}:${KM_SOURCE}:${externalId}`,
          },
        );
        candidateId = result.docId as Id<"candidates">;
        created += 1;
        // Apply the KM-mapped stage on initial import (faithful to the source).
        if (candidate.stage === "hired") {
          await ctx.runMutation(api.mutations.Candidate_hire, {
            docId: candidateId,
          });
        } else if (candidate.stage === "rejected") {
          await ctx.runMutation(api.mutations.Candidate_reject, {
            docId: candidateId,
          });
        } else if (candidate.stage !== "application") {
          await ctx.runMutation(api.mutations.Candidate_advance, {
            docId: candidateId,
            toStage: candidate.stage,
          });
        }
        // A duplicate externalId later in the same payload is caught by the
        // create's idempotencyKey cache (same key → same docId, no 2nd insert).
      }

      if (candidate.interviews.length === 0) continue;
      const candidateInterviews = await ctx.db
        .query("interviews")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
        .collect();
      // Dedupe within the payload by externalInterviewId (first wins) so two
      // KM rows sharing an id cannot both take the create branch and trip the
      // record-outcome "must be pending" guard on the second.
      const seenInterviewIds = new Set<string>();

      for (const interview of candidate.interviews) {
        if (seenInterviewIds.has(interview.externalInterviewId)) continue;
        seenInterviewIds.add(interview.externalInterviewId);

        const existingInterview = candidateInterviews.find(
          (row) =>
            row.deletedAt == null &&
            row.sourceSystem === KM_SOURCE &&
            row.externalInterviewId === interview.externalInterviewId,
        );

        if (existingInterview) {
          await ctx.db.patch(existingInterview._id, {
            rawSourceData: interview.raw,
            scheduledFor:
              interview.scheduledFor ??
              existingInterview.scheduledFor ??
              undefined,
            notes: interview.notes ?? existingInterview.notes ?? undefined,
            updatedAt: Date.now(),
            version: (existingInterview.version ?? 0) + 1,
          });
          if (
            interview.outcome !== "pending" &&
            existingInterview.outcome === "pending"
          ) {
            await ctx.runMutation(api.mutations.Interview_recordOutcome, {
              docId: existingInterview._id,
              outcome: interview.outcome,
              notes: interview.notes ?? undefined,
            });
          }
          interviewsUpdated += 1;
          continue;
        }

        const createdInterview = await ctx.runMutation(
          api.mutations.Interview_createViaSchedule,
          {
            candidateId,
            scheduledFor: interview.scheduledFor ?? undefined,
            sourceSystem: KM_SOURCE,
            externalInterviewId: interview.externalInterviewId,
            rawSourceData: interview.raw,
            idempotencyKey: `km:${auth.tenantId}:${candidateId}:${KM_SOURCE}:${interview.externalInterviewId}`,
          },
        );
        if (interview.outcome !== "pending") {
          await ctx.runMutation(api.mutations.Interview_recordOutcome, {
            docId: createdInterview.docId,
            outcome: interview.outcome,
            notes: interview.notes ?? undefined,
          });
        }
        interviewsCreated += 1;
      }
    }

    return { created, updated, interviewsCreated, interviewsUpdated };
  },
});
