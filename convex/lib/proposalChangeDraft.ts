// Start a commercial change from an accepted proposal.
//
// Accepted proposals are frozen. supersede only rewrites sent or viewed
// copies, so it must not be used here. This mutation opens a new draft that
// points at the accepted proposal and copies the live priced lines, the
// dishes the client already chose, and the optional extras still on offer.
// The accepted proposal stays as it is.
//
// Nested generated commands share one Convex transaction. A failed confirm
// or line copy rolls the new draft back.
import { mutation, type MutationCtx } from "../_generated/server";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";

export interface StartProposalChangeResult {
  docId: Id<"proposals">;
  alreadyStarted: boolean;
}

function presentText(value: string | null | undefined): string | undefined {
  if (value == null || value.trim() === "") return undefined;
  return value;
}

function changeDraftArgs(proposal: Doc<"proposals">) {
  return {
    clientId: proposal.clientId,
    title: proposal.title,
    subtotal: proposal.subtotal,
    taxAmount: proposal.taxAmount,
    discountAmount: proposal.discountAmount,
    total: proposal.total,
    guestCount: proposal.guestCount,
    replacesProposalId: proposal._id,
    eventDate: proposal.eventDate ?? undefined,
    eventEndDate: proposal.eventEndDate ?? undefined,
    eventType: presentText(proposal.eventType),
    venueName: presentText(proposal.venueName),
    venueAddress: presentText(proposal.venueAddress),
    expiresAt: proposal.expiresAt ?? undefined,
    notes: presentText(proposal.notes),
    terms: presentText(proposal.terms),
    visibleSections: proposal.visibleSections ?? undefined,
    eventId: proposal.eventId ?? undefined,
  };
}

async function openChangeDraft(
  ctx: MutationCtx,
  proposal: Doc<"proposals">,
): Promise<Doc<"proposals"> | null> {
  const rows = await ctx.db
    .query("proposals")
    .withIndex("by_replacesProposalId", (q) =>
      q.eq("replacesProposalId", proposal._id),
    )
    .collect();
  return (
    rows.find(
      (row) =>
        row.deletedAt == null &&
        row.status === "draft" &&
        row.tenantId === proposal.tenantId,
    ) ?? null
  );
}

async function copyLivePricedLines(
  ctx: MutationCtx,
  sourceId: Id<"proposals">,
  targetId: Id<"proposals">,
): Promise<void> {
  const rows = await ctx.db
    .query("proposalLineItems")
    .withIndex("by_proposalId", (q) => q.eq("proposalId", sourceId))
    .collect();
  const live = rows
    .filter(
      (row) =>
        row.deletedAt == null && row.removedAt == null && row.addedAt != null,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
  for (const line of live) {
    await ctx.runMutation(api.mutations.ProposalLineItem_createViaAddLine, {
      proposalId: targetId,
      description: line.description,
      pricingBasis: line.pricingBasis,
      unitPrice: line.unitPrice,
      amount: line.amount,
      quantity: line.quantity,
      unit: line.unit ?? undefined,
      sortOrder: line.sortOrder,
      notes: presentText(line.notes),
      menuDishId: presentText(line.menuDishId),
      overrideReason: presentText(line.overrideReason),
    });
  }
}

async function copyLiveMenuChoices(
  ctx: MutationCtx,
  sourceId: Id<"proposals">,
  targetId: Id<"proposals">,
): Promise<void> {
  const rows = await ctx.db
    .query("proposalDishSelections")
    .withIndex("by_proposalId", (q) => q.eq("proposalId", sourceId))
    .collect();
  const live = rows.filter(
    (row) =>
      row.deletedAt == null && row.removedAt == null && row.selectedAt != null,
  );
  for (const choice of live) {
    await ctx.runMutation(api.mutations.ProposalDishSelection_createViaSelect, {
      proposalId: targetId,
      menuId: choice.menuId,
      dishId: choice.dishId,
      quantityServings: choice.quantityServings,
      course: presentText(choice.course),
      serviceStyle: presentText(choice.serviceStyle),
      specialInstructions: presentText(choice.specialInstructions),
    });
  }
}

async function copyLiveExtras(
  ctx: MutationCtx,
  sourceId: Id<"proposals">,
  targetId: Id<"proposals">,
): Promise<void> {
  const rows = await ctx.db
    .query("proposalEnhancements")
    .withIndex("by_proposalId", (q) => q.eq("proposalId", sourceId))
    .collect();
  const live = rows
    .filter(
      (row) =>
        row.deletedAt == null && row.removedAt == null && row.addedAt != null,
    )
    .sort((left, right) => left.sortOrder - right.sortOrder);
  for (const extra of live) {
    await ctx.runMutation(api.mutations.ProposalEnhancement_createViaOffer, {
      proposalId: targetId,
      name: extra.name,
      price: extra.price,
      description: presentText(extra.description),
      sortOrder: extra.sortOrder,
    });
  }
}

export const startProposalChange = mutation({
  args: { proposalId: v.id("proposals") },
  returns: v.object({
    docId: v.id("proposals"),
    alreadyStarted: v.boolean(),
  }),
  handler: async (ctx, args): Promise<StartProposalChangeResult> => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.tenantId !== proposal.tenantId) {
      throw new Error("Proposal not found");
    }
    if (proposal.deletedAt != null) throw new Error("Proposal not found");
    if (proposal.status !== "accepted") {
      throw new Error("Only an accepted proposal can start a change.");
    }
    const existing = await openChangeDraft(ctx, proposal);
    if (existing) return { docId: existing._id, alreadyStarted: true };

    const created = await ctx.runMutation(
      api.mutations.Proposal_createViaDraft,
      changeDraftArgs(proposal),
    );
    // A draft just created by that command is version 1.
    await ctx.runMutation(api.mutations.Proposal_confirmChangeSource, {
      docId: created.docId,
      version: 1,
    });
    await copyLivePricedLines(ctx, proposal._id, created.docId);
    await copyLiveMenuChoices(ctx, proposal._id, created.docId);
    await copyLiveExtras(ctx, proposal._id, created.docId);
    return { docId: created.docId, alreadyStarted: false };
  },
});
