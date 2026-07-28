import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

/**
 * AUTHOR SEAM — public, token-authorized digital proposal acceptance (#115).
 *
 * A SignatureRequest's Convex `_id` IS the public bearer token, same posture as
 * `shareLinks.ts` (`normalizeId` in-handler is the auth step; no Clerk). An
 * anonymous signer holds no sales/client role, so the generated
 * `SignatureRequest_complete` + `Proposal_accept` commands are unreachable from
 * the acceptance page — this seam performs both writes raw in one transaction.
 *
 * KNOWN GAP (documented on #115): the generated `Proposal_accept` also runs the
 * ProposalDishSelection → EventDish.confirmFromProposal fanOut inline; that
 * cascade requires manageAccess and cascades further (component seeds,
 * ingredient contributions), so it is NOT replicated here. Digitally accepted
 * proposals flip to `accepted` and ledger `ProposalAccepted`, but dish
 * confirmation stays with the operator flows until reaction projection or an
 * internal system-authority command exists.
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
  };
};

async function resolvePendingRequest(
  ctx: QueryCtx,
  token: string,
): Promise<Doc<"signatureRequests"> | null> {
  const requestId = ctx.db.normalizeId("signatureRequests", token);
  if (!requestId) return null;
  const request = await ctx.db.get(requestId);
  if (!request || request.deletedAt != null) return null;
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
    if (
      !revision ||
      revision.deletedAt != null ||
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
      },
    };
  },
});

/**
 * Complete a signature request and accept its proposal, token-authorized.
 * Mirrors the generated command semantics: same status/expiry guards, same
 * ledger events (SignatureCompleted, ProposalAccepted). A proposal that can no
 * longer be accepted (declined/expired/superseded) rolls the whole thing back;
 * an already-accepted proposal is treated as success (idempotent re-click).
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
    const request = await resolvePendingRequest(ctx, token);
    if (!request) {
      throw new ConvexError(
        "This acceptance link is no longer valid. Please contact us for a new one.",
      );
    }

    const now = Date.now();
    const signedArtifactReference = `internal:click-accept:${now}`;

    await ctx.db.patch(request._id, {
      status: "completed",
      completedAt: now,
      signedArtifactReference,
      signerIpAddress: signerIpAddress ?? null,
      signerUserAgent: signerUserAgent ?? null,
      updatedAt: now,
      version: (request.version ?? 0) + 1,
    });
    await ctx.db.insert("manifestEvents", {
      type: "SignatureCompleted",
      entity: "SignatureRequest",
      entityId: request._id,
      payload: {
        signatureRequestId: request._id,
        tenantId: request.tenantId,
        proposalRevisionId: request.proposalRevisionId,
        proposalId: request.proposalId ?? null,
        recipientEmail: request.recipientEmail,
        recipientName: request.recipientName,
        signedAt: now,
        signedArtifactReference,
      },
      createdAt: now,
    });

    if (request.proposalId) {
      const proposalId = ctx.db.normalizeId("proposals", request.proposalId);
      const proposal: Doc<"proposals"> | null = proposalId
        ? await ctx.db.get(proposalId)
        : null;
      if (
        !proposal ||
        proposal.deletedAt != null ||
        proposal.tenantId !== request.tenantId
      ) {
        throw new ConvexError(
          "The proposal for this acceptance link is unavailable. Please contact us.",
        );
      }
      if (proposal.status === "accepted") {
        return { ok: true };
      }
      if (proposal.status !== "sent" && proposal.status !== "viewed") {
        throw new ConvexError(
          "This proposal can no longer be accepted. Please contact us for an updated proposal.",
        );
      }
      if (proposal.expiresAt != null && proposal.expiresAt <= now) {
        throw new ConvexError(
          "This proposal has expired. Please contact us for an updated proposal.",
        );
      }

      await ctx.db.patch(proposal._id, {
        status: "accepted",
        acceptedAt: now,
        version: (proposal.version ?? 0) + 1,
      });
      // Same payload fields as generated Proposal_accept's ProposalAccepted.
      await ctx.db.insert("manifestEvents", {
        type: "ProposalAccepted",
        entity: "Proposal",
        entityId: proposal._id,
        payload: {
          proposalId: proposal._id,
          tenantId: proposal.tenantId,
          clientId: proposal.clientId,
          eventId: proposal.eventId ?? null,
          title: proposal.title,
          eventDate: proposal.eventDate ?? null,
          eventType: proposal.eventType ?? null,
          guestCount: proposal.guestCount,
          venueName: proposal.venueName ?? null,
          venueAddress: proposal.venueAddress ?? null,
          subtotal: proposal.subtotal,
          taxAmount: proposal.taxAmount,
          discountAmount: proposal.discountAmount,
          total: proposal.total,
          dishSelectionProposalId:
            proposal.eventId != null ? proposal._id : null,
        },
        createdAt: now,
      });
    }

    return { ok: true };
  },
});
