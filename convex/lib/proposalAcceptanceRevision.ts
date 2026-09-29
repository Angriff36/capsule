import type { ConvexCommandEvent } from "@angriff36/manifest/projections/convex";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Records WHICH ProposalRevision an acceptance committed to, inside the
 * acceptance's own transaction (AC-413 / AC-434, spec §7.2.3).
 *
 * Why a seam: `Proposal.accept` can store only what its command params carry,
 * and the operator usually accepts without naming a revision. This authored
 * callback resolves and validates the revision evidence atomically — it reads
 * sibling ProposalRevision rows through ordinary queries and runs in
 * `handleManifestEvent` after the declared reactions, in the same transaction
 * as the accept:
 *
 * - explicit `acceptedRevisionId` (the SignatureCompleted reaction passes the
 *   request's `proposalRevisionId`): validated live, captured, same tenant,
 *   same proposal — otherwise the whole acceptance (and its cascade) rolls
 *   back with a generic "Accepted revision not found" (no foreign-data
 *   oracle);
 * - no explicit revision: the highest captured live revision of this proposal
 *   in this tenant AT ACCEPTANCE TIME, else explicit null — an honest "no
 *   revision captured" that a later capture never back-fills.
 *
 * ~~The resolved reference is patched onto the proposal (no extra version
 * increment — the accept command already bumped it) and onto the just-written
 * ProposalAccepted ledger row, so the payload carries the same evidence.~~
 * 2026-09-29: an explicit revision is already stored by `Proposal.accept`
 * and carried in its ProposalAccepted payload; this callback only validates
 * it. Without one, the resolved reference (or null) is recorded through the
 * generated `Proposal.recordAcceptedRevision` command, run with the same
 * identity as the accept (the caller, or the system runner's elevated ctx),
 * which stores it and emits ProposalAcceptedRevisionRecorded. Emitted ledger
 * rows are never rewritten. Pre-2026-09-29 ProposalAccepted rows carry the
 * resolved value in their own (then patched) payload and have no
 * ProposalAcceptedRevisionRecorded row.
 * `accepted` is a terminal status, so a later revision can never re-label an
 * old acceptance.
 */
export async function recordAcceptedProposalRevision(
  ctx: MutationCtx,
  event: ConvexCommandEvent,
): Promise<void> {
  const proposal = await ctx.db.get(event.entityId as Id<"proposals">);
  if (!proposal) return;

  const requested = event.payload.acceptedRevisionId;
  let resolved: Id<"proposalRevisions"> | null = null;
  if (typeof requested === "string" && requested.length > 0) {
    // Reject malformed / wrong-table ids before any read — a raw foreign id
    // must not become evidence.
    const requestedId = ctx.db.normalizeId("proposalRevisions", requested);
    const revision = requestedId != null ? await ctx.db.get(requestedId) : null;
    if (
      !revision ||
      revision.deletedAt != null ||
      revision.capturedAt == null ||
      revision.tenantId !== proposal.tenantId ||
      revision.proposalId !== proposal._id
    ) {
      throw new Error("Accepted revision not found");
    }
    resolved = requestedId;
  } else {
    // Highest live captured revision at acceptance time. Indexed async
    // iteration visits one row at a time instead of allocating the whole
    // per-proposal history; the selection is unchanged and nothing is
    // truncated.
    let highest = Number.NEGATIVE_INFINITY;
    for await (const row of ctx.db
      .query("proposalRevisions")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))) {
      if (
        row.tenantId === proposal.tenantId &&
        row.deletedAt == null &&
        row.capturedAt != null &&
        row.revisionNumber > highest
      ) {
        highest = row.revisionNumber;
        resolved = row._id;
      }
    }
  }

  // Explicit revision: Proposal.accept already stored it (and cleared the
  // pending marker); validation above is all that is left.
  if (proposal.acceptedRevisionPending !== true) return;
  await ctx.runMutation(api.mutations.Proposal_recordAcceptedRevision, {
    docId: proposal._id,
    version: proposal.version,
    ...(resolved !== null ? { acceptedRevisionId: resolved } : {}),
  });
}
