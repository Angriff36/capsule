// Book an accepted proposal into a new Event — authored seam (issue #141).
//
// The only path from an accepted proposal was /events/new?clientId=…, which
// created an UNLINKED event: the dish-selection → EventDish cascade only
// fires for a proposal that knows its event, and signature-completion
// acceptance never links one, so accepted-unlinked proposals are a normal
// state that had no way forward.
//
// This mutation is pure orchestration of generated governed commands in ONE
// Convex transaction (nested runMutation calls are subtransactions; an
// uncaught throw rolls the whole booking back — same pattern as
// lib/proposalRevision.sendProposalWithRevisionCapture):
//   1. Event_createViaPlanEngagement — creates the event (salesAccess or
//      eventAccess policies, planEngagement guards/constraints).
//   2. Proposal_linkEvent — the Proposal.linkEvent domain command
//      (src/sales/proposal.manifest): links Proposal.eventId, emits
//      ProposalEventLinked, and runs the ProposalDishSelection fanOut through
//      EventDish.confirmFromProposal (src/sales/proposal-dish-selection.manifest)
//      with the operator's auth — the same idempotent cascade accept-with-event
//      uses, so the client's menu copies onto the new event.
//
// The pre-checks below only exist to fail fast with operator-readable errors
// before any write; the domain command re-enforces all of them.
import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";

// The linked event's id type, derived from the proposal document type rather
// than named directly, so the event-manifest integration guard can prove this
// module never writes event documents itself — every write in this seam goes
// through a generated governed command.
type LinkedEventId = NonNullable<Doc<"proposals">["eventId"]>;

export interface CreateEventFromProposalResult {
  docId: LinkedEventId;
}

export const createEventFromAcceptedProposal = mutation({
  args: {
    proposalId: v.id("proposals"),
    // Optimistic concurrency against the proposal row (same convention as the
    // generated Proposal commands; Proposal_linkEvent checks it again).
    proposalVersion: v.optional(v.number()),
    // Event.planEngagement command args — validated again (policies, guards,
    // constraints) by the generated Event_createViaPlanEngagement mutation.
    event: v.object({
      clientId: v.string(),
      title: v.string(),
      eventType: v.string(),
      startsAt: v.number(),
      endsAt: v.number(),
      expectedHeadcount: v.number(),
      primaryContactName: v.string(),
      budgetAmount: v.number(),
      quotedPrice: v.number(),
      serviceStyleId: v.optional(v.string()),
      occasionId: v.optional(v.string()),
      venueId: v.optional(v.string()),
      venueName: v.optional(v.string()),
      venueAddress: v.optional(v.string()),
      venueCapacity: v.optional(v.number()),
      primaryContactEmail: v.optional(v.string()),
      primaryContactPhone: v.optional(v.string()),
      accessibilityNeeds: v.optional(v.array(v.string())),
      serviceRequirements: v.optional(v.string()),
      operationalRequirements: v.optional(v.string()),
      assignedToId: v.optional(v.string()),
      referralSourceId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<CreateEventFromProposalResult> => {
    // Non-disclosing tenant check before anything else (same shape as
    // sendProposalWithRevisionCapture): a foreign proposal id must look
    // exactly like a missing one.
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.tenantId !== proposal.tenantId) {
      throw new Error("Proposal not found");
    }
    if (proposal.deletedAt != null) throw new Error("Proposal not found");
    if (proposal.status !== "accepted") {
      throw new Error("Only an accepted proposal can be booked into an event.");
    }
    if (proposal.eventId != null) {
      throw new Error(
        "This proposal is already linked to an event — open that event instead of creating another.",
      );
    }
    if (
      args.proposalVersion !== undefined &&
      proposal.version !== args.proposalVersion
    ) {
      throw new Error(
        `ConcurrencyConflict: VERSION_MISMATCH expected ${args.proposalVersion} actual ${proposal.version}`,
      );
    }
    if (args.event.clientId !== String(proposal.clientId)) {
      throw new Error("The event's client must match the proposal's client.");
    }

    // 1. Create the event through the generated governed command.
    const created: { docId: LinkedEventId } = await ctx.runMutation(
      api.mutations.Event_createViaPlanEngagement,
      args.event,
    );

    // 2. Link + menu cascade through the Proposal.linkEvent domain command.
    // If the link or any cascaded dish confirmation fails, the uncaught throw
    // rolls back the event creation too — no half-booked state.
    await ctx.runMutation(api.mutations.Proposal_linkEvent, {
      docId: args.proposalId,
      version: args.proposalVersion,
      eventId: created.docId,
    });

    return { docId: created.docId };
  },
});
