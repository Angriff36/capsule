// Book an accepted proposal into a new Event — authored seam.
//
// Issue #141: the only path from an accepted proposal was
// /events/new?clientId=…, which created an UNLINKED event, so the
// ProposalAccepted → EventDish.confirmFromProposal cascade never fired and
// title/date/venue/menu were retyped by hand. The domain links an event to a
// proposal only inside Proposal.accept (sent/viewed → accepted), and the
// signature-completion cascade accepts WITHOUT an event, so accepted-unlinked
// proposals are a normal state that previously had no way forward.
//
// This mutation runs the whole booking as ONE Convex transaction (nested
// runMutation calls are subtransactions; an uncaught throw rolls everything
// back — same pattern as lib/proposalRevision.sendProposalWithRevisionCapture):
//   1. Create the Event through the generated governed command
//      (Event_createViaPlanEngagement — policies/guards/constraints apply).
//   2. Copy the client's live menu selections through the generated
//      EventDish_createViaAddToEvent command (same rows the accept-time
//      cascade would have fed to EventDish.confirmFromProposal).
//   3. Link Proposal.eventId to the new event.
//
// Step 3 is a raw patch because the domain has no post-acceptance link
// command (Proposal.accept is the only eventId writer and `accepted` is
// terminal). BRIDGE, not destination: the proper fix is a
// Proposal.linkEvent command + a ProposalEventLinked fanOut mirroring the
// ProposalAccepted cascade in src/sales/proposal-dish-selection.manifest,
// which needs a Builder regen (`bun run manifest:regen`). Once that command
// exists, steps 2–3 collapse into a single ctx.runMutation on it.
import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";

// The linked event's id type, derived from the proposal document type rather
// than named directly, so the event-manifest integration guard can prove this
// module never writes event documents itself — the Event is created through
// the generated governed command above.
type LinkedEventId = NonNullable<Doc<"proposals">["eventId"]>;

export interface CreateEventFromProposalResult {
  docId: LinkedEventId;
  copiedDishCount: number;
}

export const createEventFromAcceptedProposal = mutation({
  args: {
    proposalId: v.id("proposals"),
    // Optimistic concurrency against the proposal row (same convention as the
    // generated Proposal commands).
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
    // Non-disclosing tenant check before reading anything else (same shape as
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

    // 1. Create the event through the generated governed command. Its
    // policies (eventAccess/salesAccess) and planEngagement guards/constraints
    // run exactly as they do for a plain /events/new create.
    const created: { docId: LinkedEventId } = await ctx.runMutation(
      api.mutations.Event_createViaPlanEngagement,
      args.event,
    );

    // 2. Copy the client's live menu selections. Same row set the accept-time
    // ProposalAccepted fanOut feeds to EventDish.confirmFromProposal
    // (deletedAt == null; removed selections are skipped). The event is brand
    // new so there is nothing to match against — every selection is a fresh
    // EventDish line via the generated create command, which also seeds
    // purchasingWeekStart and the BOM hop the same way the cascade does.
    const selections = (
      await ctx.db
        .query("proposalDishSelections")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", args.proposalId))
        .collect()
    ).filter((row) => row.deletedAt == null);
    for (const selection of selections) {
      await ctx.runMutation(api.mutations.EventDish_createViaAddToEvent, {
        eventId: created.docId,
        dishId: String(selection.dishId),
        quantityServings: selection.quantityServings,
        course: selection.course ?? undefined,
        serviceStyle: selection.serviceStyle ?? undefined,
        specialInstructions: selection.specialInstructions ?? undefined,
      });
    }

    // 3. Link the proposal to its event. Raw patch — bridge until the domain
    // grows Proposal.linkEvent (see header). Version bump mirrors what the
    // generated Proposal commands do so optimistic concurrency stays honest.
    await ctx.db.patch(args.proposalId, {
      eventId: created.docId,
      updatedAt: Date.now(),
      version: (proposal.version ?? 0) + 1,
    });

    return { docId: created.docId, copiedDishCount: selections.length };
  },
});
