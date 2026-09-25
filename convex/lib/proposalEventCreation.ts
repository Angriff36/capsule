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
//   2. Proposal_stageEventLink → Proposal_linkEvent — the domain's staged
//      link handshake (src/sales/proposal.manifest, same shape as
//      stageClientMerge → reassignClient): stage records the candidate id,
//      linkEvent promotes it only after guarding through the resolved
//      pendingEvent relation that the event exists in this tenant, is live,
//      not cancelled, and belongs to the proposal's client. linkEvent then
//      emits ProposalEventLinked, whose ProposalDishSelection fanOut runs
//      EventDish.confirmFromProposal (src/sales/proposal-dish-selection.manifest)
//      with the operator's auth — the same idempotent cascade
//      accept-with-event uses, so the client's menu copies onto the new event.
//
// The pre-checks below only exist to fail fast with operator-readable errors
// before any write; the domain commands are the authority and re-enforce all
// of them (plus the event-side guards the seam cannot see).
import { mutation, internalMutation } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";
import { proposalBookingVenue } from "./proposalBookingVenue";

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
    // A lost response must not wedge the retry (issue #389, spec §7.1
    // "Replaying acceptance or booking returns the existing Event"): an
    // accepted proposal with an intact event link IS booked — return that
    // event without creating, staging, linking, or cascading again. A
    // dangling or cross-tenant link is still an operator error.
    if (proposal.eventId != null) {
      const linked = await ctx.db.get(proposal.eventId);
      if (
        linked != null &&
        linked.deletedAt == null &&
        linked.tenantId === proposal.tenantId &&
        String(linked.clientId) === String(proposal.clientId) &&
        linked.stage !== "cancelled"
      ) {
        return { docId: proposal.eventId };
      }
      if (linked != null && linked.stage === "cancelled") {
        throw new Error(
          "The event this proposal was booked into has been cancelled. Unlink the proposal from it before booking again.",
        );
      }
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

    // Venue identity (AC-410): the proposal stores a venue NAME only. When
    // the caller omitted venueId, resolve that name against this tenant's
    // saved venues — a unique live match is attached, an ambiguous one throws
    // (never a silent first match), zero matches books with the caller's
    // text. A caller-picked id is kept and re-checked against live tenant
    // venues. Read-only here: the governed command below re-enforces
    // everything on the event row itself.
    const venueRows = await ctx.db
      .query("venues")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", proposal.tenantId))
      .collect();
    const decision = proposalBookingVenue.decide({
      tenantId: proposal.tenantId,
      proposalVenueName: proposal.venueName ?? args.event.venueName,
      requestedVenueId: args.event.venueId,
      venues: venueRows,
    });
    const eventArgs = { ...args.event };
    if (decision.kind !== "none") {
      eventArgs.venueId = decision.venue._id;
      if (!eventArgs.venueName?.trim()) {
        eventArgs.venueName = decision.venue.name;
      }
      if (eventArgs.venueCapacity === undefined) {
        eventArgs.venueCapacity = decision.venue.capacity;
      }
    }

    // 1. Create the event through the generated governed command.
    const created: { docId: LinkedEventId } = await ctx.runMutation(
      api.mutations.Event_createViaPlanEngagement,
      eventArgs,
    );

    // 2. Staged link + menu cascade through the domain commands. If staging,
    // the link guards, or any cascaded dish confirmation fails, the uncaught
    // throw rolls back the event creation too — no half-booked state. The
    // caller's optimistic version applies to the stage step; linkEvent runs
    // against the staged row inside the same transaction.
    await ctx.runMutation(api.mutations.Proposal_stageEventLink, {
      docId: args.proposalId,
      version: args.proposalVersion,
      eventId: created.docId,
    });
    await ctx.runMutation(api.mutations.Proposal_linkEvent, {
      docId: args.proposalId,
    });

    return { docId: created.docId };
  },
});

// Quote-conversion convergence repair (issue #391, spec §7.2-2 / §23.3-23.6):
// a retry that reuses a checkpointed draft proposal must leave exactly one
// Proposal-to-Event relationship, or accepting the proposal later books a
// second Event. Internal — only processQuoteSubmission calls it — so this is
// not another public booking API: it never creates an Event, only reconciles
// the link through the domain's own staged handshake.
//
// Both documents load through the generated authorized reads (the same
// canonical read authority quoteBuilder.getEventBookingDetails uses), which
// apply the read policy and filter soft-deleted and cross-tenant rows to
// null. The Event is validated BEFORE any success return — including the
// same-event no-op a replay takes — so a deleted or foreign Event can never
// be reported as successfully recovered.
//
// Already correctly linked to a VALID event (every normal fresh conversion
// lands here) → success with no mutation, so a replay never bumps the
// proposal's version. Linked to a DIFFERENT event → refused, never
// overwritten. Unlinked → stage+link in this transaction; any failure rolls
// the staged pointer back.
export const linkConvertedQuoteProposal = internalMutation({
  args: {
    proposalId: v.id("proposals"),
    eventId: v.id("events"),
  },
  handler: async (ctx, args): Promise<CreateEventFromProposalResult> => {
    // The caller's (operator) auth applies through the generated reads — no
    // elevated system runner; a foreign proposal id looks exactly like a
    // missing one.
    const proposal: Doc<"proposals"> | null = await ctx.runQuery(
      api.queries.getProposal,
      { id: args.proposalId },
    );
    if (!proposal) throw new Error("Proposal not found");
    const event: Doc<"events"> | null = await ctx.runQuery(api.queries.getEvent, {
      id: args.eventId,
    });
    if (!event) throw new Error("Conversion event not found in this tenant.");
    if (String(event.clientId) !== String(proposal.clientId)) {
      throw new Error("The event's client must match the proposal's client.");
    }
    // The generated read filters only soft deletion: a cancelled event is
    // still returned, and the same-event no-op below must not call that a
    // completed conversion.
    if (event.stage === "cancelled") {
      throw new Error(
        "The conversion event has been cancelled. Unlink the proposal from it before booking again.",
      );
    }

    // The event is now proven live, in-tenant, and the proposal's client —
    // for both paths, including the same-event no-op. Stage/live/cancelled
    // business rules stay with the domain commands below.
    if (proposal.eventId != null) {
      if (proposal.eventId === args.eventId) {
        return { docId: proposal.eventId };
      }
      throw new Error(
        "This proposal is already linked to a different event — open that event instead of forcing a second link.",
      );
    }

    // New link only: stage + promote through the generated governed commands
    // — the sole write/policy/guard authority here (their link guards
    // re-enforce liveness, cancelled stage, tenant and client through the
    // pendingEvent relation; draft or accepted both link, a draft's null
    // cascade key copies no menu). An uncaught throw rolls the staged pointer
    // back with the whole subtransaction.
    await ctx.runMutation(api.mutations.Proposal_stageEventLink, {
      docId: args.proposalId,
      eventId: args.eventId,
    });
    await ctx.runMutation(api.mutations.Proposal_linkEvent, {
      docId: args.proposalId,
    });

    return { docId: args.eventId };
  },
});
