// AUTHOR SEAM — idempotent KM interview-tool ingest (spec §9.3).
//
// The generated Candidate/Interview commands create ONE record at a time and
// cannot upsert. Spec §9.3 requires "re-importing the same candidate/interview
// updates the source-linked records without duplication." This mutation does
// the find-or-upsert loop the generated commands can't:
//
//   - parse the pasted KM JSON (kmParser),
//   - for each candidate: find an existing Candidate by (sourceSystem,
//     externalCandidateId); if absent, create via Candidate_createViaApply
//     (with a deterministic idempotencyKey as a second dedup layer); if
//     present, patch the mutable source fields (raw + contact info),
//   - for each interview under that candidate: upsert by externalInterviewId;
//     a KM outcome is recorded via Interview_recordOutcome when the interview
//     is still pending (so a re-import that now carries a result records it).
//
// Source IDs + raw responses live on the Candidate/Interview rows themselves
// (not ExternalRecordLink) — candidates/interviews ARE the Capsule records, so
// there is nothing to reconcile-match against (unlike the TPP payment/event
// imports). The ingest is gated at the workforceManageAccess tier, mirroring
// the entities' own policy; the generated commands re-check via getAuthContext,
// so a non-manager caller is denied at two layers. Auth propagates through
// ctx.runMutation (same identity), as it does for importCommit.
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { getAuthContext } from "./lib/authContext";
import { parseKmCandidates } from "./kmParser";
import type { Id } from "./_generated/dataModel";

// Mirror of the roles granted `workforceManageAccess` in
// src/foundation/base.manifest (manager + every *_manager + admin/owner/system
// via `extends`). checkRole is generated as a non-exported local, so the seam
// re-checks the same set. Keep in sync with base.manifest.
const WORKFORCE_MANAGE_ROLES = new Set([
  "manager",
  "kitchen_manager",
  "sales_manager",
  "event_manager",
  "inventory_manager",
  "logistics_manager",
  "workforce_manager",
  "finance_manager",
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
      const externalId = candidate.externalCandidateId ?? "";
      const existing = externalId
        ? (tenantCandidates.find(
            (row) =>
              row.deletedAt == null &&
              row.sourceSystem === KM_SOURCE &&
              row.externalCandidateId === externalId,
          ) ?? null)
        : null;
      let candidateId: Id<"candidates">;

      if (existing) {
        // Re-import: refresh source/raw + contact (stage is an operator decision).
        await ctx.db.patch(existing._id, {
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
            sourceSystem: externalId ? KM_SOURCE : undefined,
            externalCandidateId: externalId || undefined,
            rawSourceData: candidate.raw,
            idempotencyKey: externalId
              ? `km:${auth.tenantId}:${KM_SOURCE}:${externalId}`
              : undefined,
          },
        );
        candidateId = result.docId as Id<"candidates">;
        created += 1;
        // A duplicate externalId later in the same payload is caught by the
        // create's idempotencyKey cache (same key → returns the same docId, no
        // second insert) — no need to mutate the in-memory scan list.
      }

      if (candidate.interviews.length === 0) continue;
      const candidateInterviews = await ctx.db
        .query("interviews")
        .withIndex("by_candidateId", (q) => q.eq("candidateId", candidateId))
        .collect();

      for (const interview of candidate.interviews) {
        const ivExternalId = interview.externalInterviewId ?? "";
        const existingInterview = ivExternalId
          ? (candidateInterviews.find(
              (row) =>
                row.deletedAt == null &&
                row.sourceSystem === KM_SOURCE &&
                row.externalInterviewId === ivExternalId,
            ) ?? null)
          : null;

        if (existingInterview) {
          await ctx.db.patch(existingInterview._id, {
            rawSourceData: interview.raw,
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
            sourceSystem: ivExternalId ? KM_SOURCE : undefined,
            externalInterviewId: ivExternalId || undefined,
            rawSourceData: interview.raw,
            idempotencyKey: ivExternalId
              ? `km:${auth.tenantId}:${candidateId}:${KM_SOURCE}:${ivExternalId}`
              : undefined,
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
