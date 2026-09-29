import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { TenantSystemCommandRunner } from "./lib/tenantSystemCommandRunner";

/**
 * AUTHOR SEAM — public, token-authorized digital proposal acceptance (#115).
 *
 * A SignatureRequest's Convex `_id` IS the public bearer token, same posture as
 * `shareLinks.ts` (`normalizeId` in-handler is the auth step; no Clerk). An
 * anonymous signer holds no sales/client role, so the generated
 * `SignatureRequest_complete` command is unreachable from the acceptance page —
 * this seam performs the completion itself.
 *
 * ~~The proposal acceptance is NOT re-implemented here. After the seam's own
 * token/revision/proposal validations pass, the acceptance runs through the
 * SAME generated `Proposal_accept` command the operator path uses, via the
 * established tenant-system runner …~~
 * 2026-09-29: neither the completion nor the acceptance is written here.
 * After the seam's own token/revision/proposal validations pass (all reads),
 * it runs the generated `SignatureRequest_completeInternal` command through
 * the established tenant-system runner
 * (convex/lib/tenantSystemCommandRunner.ts). That command records the
 * completion and emits SignatureCompleted; the declared
 * `on SignatureCompleted run Proposal.accept` reaction then runs the SAME
 * `Proposal.accept` the operator path uses. The runner is pinned to the
 * VALIDATED `request.tenantId` — never caller input — and substitutes only
 * the identity: the commands keep their sales role policy, the tenant's
 * capability kill-switch, their status/expiry guards, the ProposalAccepted
 * ledger row, the accepted-revision recording
 * (convex/lib/proposalAcceptanceRevision.ts) and the ProposalDishSelection →
 * EventDish.confirmFromProposal menu cascade — issue #390 (AC-414/AC-435).
 * It all runs in the CURRENT transaction, so a downstream rejection (a linked
 * event that fails the generated tenant relation check, a disabled sales
 * capability) rolls the signature completion back with the acceptance:
 * signature and acceptance commit together or not at all.
 */

type PendingSignatureView = {
  recipientName: string;
  recipientEmail: string;
  revisionNumber: number;
  capturedAt: number | null;
  changeSummary: string | null;
  expiresAt: number | null;
  proposal: {
    title: string;
    total: number;
    clientName: string;
    terms: string | null;
    eventDate: number | null;
    guestCount: number;
    venueName: string | null;
    visibleSections: string[];
  };
  enhancements: Array<{
    name: string;
    description: string | null;
    price: number;
  }>;
};

async function resolvePendingRequest(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"signatureRequests"> | null> {
  const requestId = ctx.db.normalizeId("signatureRequests", token);
  if (!requestId) return null;
  const request = await ctx.db.get(requestId);
  if (!request || request.deletedAt != null) return null;
  // Public click-to-accept is only valid for internal requests. External
  // providers (docusign, …) complete via their own verified callbacks; their
  // row ids must not double as public bearer tokens (sol review 2026-07-28).
  if (request.provider !== "internal") return null;
  if (request.status !== "requested") return null;
  if (request.expiresAt != null && request.expiresAt <= Date.now()) return null;
  return request;
}

/** Resolve an acceptance token to a client-safe pending view, or null. */
export const getPendingSignatureRequest = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<PendingSignatureView | null> => {
    const request = await resolvePendingRequest(ctx, token);
    if (!request) return null;

    const revision: Doc<"proposalRevisions"> | null = await ctx.db.get(
      request.proposalRevisionId,
    );
    // Unavailable also means not yet captured: an uncaptured revision is
    // still mutable, so serving or accepting it would let a later capture
    // retroactively relabel the acceptance (AC-413/AC-434). This binds only
    // the request's named revision; the operator no-revision path (explicit
    // null) is unchanged.
    if (
      !revision ||
      revision.deletedAt != null ||
      revision.capturedAt == null ||
      revision.tenantId !== request.tenantId
    ) {
      return null;
    }

    let snapshot: Record<string, unknown> = {};
    try {
      snapshot = revision.snapshot ? JSON.parse(revision.snapshot) : {};
    } catch {
      return null;
    }
    const proposal = (snapshot.proposal ?? {}) as Record<string, unknown>;
    const client = (snapshot.client ?? {}) as Record<string, unknown>;
    const enhancements = Array.isArray(snapshot.enhancements)
      ? (snapshot.enhancements as Array<Record<string, unknown>>)
      : [];
    const num = (value: unknown, fallback = 0): number =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const str = (value: unknown): string | null =>
      typeof value === "string" && value.length > 0 ? value : null;

    return {
      recipientName: request.recipientName,
      recipientEmail: request.recipientEmail,
      revisionNumber: revision.revisionNumber,
      capturedAt: revision.capturedAt ?? null,
      changeSummary: str(revision.changeSummary),
      expiresAt: request.expiresAt ?? null,
      proposal: {
        title: typeof proposal.title === "string" ? proposal.title : "Proposal",
        total: num(proposal.total),
        clientName:
          typeof client.name === "string" && client.name.length > 0
            ? client.name
            : "Client",
        terms: str(proposal.terms),
        eventDate:
          typeof proposal.eventDate === "number" ? proposal.eventDate : null,
        guestCount: num(proposal.guestCount),
        venueName: str(proposal.venueName),
        visibleSections: Array.isArray(proposal.visibleSections)
          ? proposal.visibleSections.filter(
              (section): section is string => typeof section === "string",
            )
          : [],
      },
      enhancements: enhancements
        .map((item, index) => ({
          sortOrder: num(item.sortOrder, index),
          name: typeof item.name === "string" ? item.name : "",
          description: str(item.description),
          price: num(item.price),
        }))
        .filter((item) => item.name.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ name, description, price }) => ({
          name,
          description,
          price,
        })),
    };
  },
});

/**
 * Complete a signature request and accept its proposal, token-authorized.
 * The seam validates the token, revision and proposal (reads only), then the
 * generated `SignatureRequest.completeInternal` command, run as the tenant's
 * system role, records the completion and emits SignatureCompleted, whose
 * declared reaction runs the canonical `Proposal.accept` (see header). One
 * transaction end to end: signature completion and acceptance commit or roll
 * back together. A proposal that can no longer be accepted
 * (declined/expired/superseded) refuses before any write; an already-accepted
 * proposal still records the signature, runs no second acceptance and keeps
 * its original accepted revision.
 */
export const completeSignature = mutation({
  args: {
    token: v.string(),
    signerIpAddress: v.optional(v.string()),
    signerUserAgent: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { token, signerIpAddress, signerUserAgent },
  ): Promise<{ ok: true }> => {
    // Idempotent re-click/reload after a committed acceptance: the signature
    // and the proposal accept land in one transaction, so a completed internal
    // request means the whole acceptance already succeeded.
    const completedId = ctx.db.normalizeId("signatureRequests", token);
    const priorRequest = completedId ? await ctx.db.get(completedId) : null;
    if (
      priorRequest &&
      priorRequest.deletedAt == null &&
      priorRequest.provider === "internal" &&
      priorRequest.status === "completed"
    ) {
      return { ok: true };
    }

    const request = await resolvePendingRequest(ctx, token);
    if (!request) {
      throw new ConvexError(
        "This acceptance link is no longer valid. Please contact us for a new one.",
      );
    }

    const now = Date.now();
    // The revision is what the signer saw — it is the authoritative binding.
    // A caller-supplied request.proposalId naming a different proposal than
    // the displayed revision's would accept B while showing A (sol review
    // 2026-07-28), so the accept target derives from the revision itself.
    const revision = await ctx.db.get(request.proposalRevisionId);
    // Same captured check as the pending view: an uncaptured revision is
    // mutable evidence, and acceptedRevisionId must never point at a row a
    // later capture could rewrite. Every refusal here happens before any
    // write.
    if (
      !revision ||
      revision.deletedAt != null ||
      revision.capturedAt == null ||
      revision.tenantId !== request.tenantId
    ) {
      throw new ConvexError(
        "The proposal for this acceptance link is unavailable. Please contact us.",
      );
    }
    if (
      request.proposalId &&
      String(request.proposalId) !== String(revision.proposalId)
    ) {
      throw new ConvexError(
        "This acceptance link is inconsistent. Please contact us for a new one.",
      );
    }
    const proposal: Doc<"proposals"> | null = await ctx.db.get(
      revision.proposalId,
    );
    if (
      !proposal ||
      proposal.deletedAt != null ||
      proposal.tenantId !== request.tenantId
    ) {
      throw new ConvexError(
        "The proposal for this acceptance link is unavailable. Please contact us.",
      );
    }
    // An already-accepted proposal (the operator or another request got there
    // first) still records this signature, but runs no second acceptance and
    // keeps its original accepted revision.
    const alreadyAccepted = proposal.status === "accepted";
    if (
      !alreadyAccepted &&
      proposal.status !== "sent" &&
      proposal.status !== "viewed"
    ) {
      throw new ConvexError(
        "This proposal can no longer be accepted. Please contact us for an updated proposal.",
      );
    }
    if (
      !alreadyAccepted &&
      proposal.expiresAt != null &&
      proposal.expiresAt <= now
    ) {
      throw new ConvexError(
        "This proposal has expired. Please contact us for an updated proposal.",
      );
    }

    // Canonical completion + acceptance (#390, AC-414/AC-435): the generated
    // SignatureRequest.completeInternal command, run as the tenant's system
    // role pinned to the validated request.tenantId — never caller input. It
    // emits SignatureCompleted, and the declared `on SignatureCompleted run
    // Proposal.accept` reaction accepts the validated proposal inline with
    // the signer's revision (AC-413), so the command's own guards (status,
    // expiry, sales policy, capability kill-switch), ProposalAccepted ledger
    // row, accepted-revision recording and the ProposalDishSelection →
    // EventDish.confirmFromProposal menu cascade run exactly as operator
    // acceptance. No catch: a downstream rejection throws out of this
    // mutation and nothing commits.
    const system = TenantSystemCommandRunner.forTenant(
      ctx,
      request.tenantId,
    ).context;
    await system.runMutation(api.mutations.SignatureRequest_completeInternal, {
      docId: request._id,
      version: request.version,
      signedArtifactReference: `internal:click-accept:${now}`,
      ...(signerIpAddress !== undefined ? { signerIpAddress } : {}),
      ...(signerUserAgent !== undefined ? { signerUserAgent } : {}),
      ...(alreadyAccepted ? {} : { acceptProposalId: proposal._id }),
    });

    return { ok: true };
  },
});
