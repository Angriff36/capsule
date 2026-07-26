// Proposal pricing recompute seam — spec §5.4 "one central calculation path".
//
// A draft proposal's priced lines (ProposalLineItem) can be added, revised, or
// removed after the initial draft. Each such edit changes the line set, so the
// parent Proposal totals (subtotal/total) AND every line's stored `amount`
// (percentage lines resolve against the base subtotal) must be restamped
// through the SAME central calc (src/lib/pricing.ts) the draft form, the
// published revision, and every read surface use. Without this seam, editing a
// line desynced the parent totals and left percentage lines stale — codex P1 #4
// — and reviseLine/removeLine stayed inert (no UI wired them).
//
// Mirrors proposalRevision.ts: each client-callable mutation runs the GUARDED
// generated line command as a subtransaction (enforces salesAccess +
// status=="draft" via the manifest), then this internal recompute restamps the
// derived amounts/totals. An uncaught throw rolls back the whole transaction
// (Convex guideline: nested runMutation from a mutation = subtransactions), so
// a line edit and its recompute commit atomically or not at all — a proposal is
// never left with totals that don't match its lines.

import { internalMutation, mutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";

// Restamp every active line's `amount` and the proposal's subtotal/total from
// the central calc. internalMutation → server-only (called after a guarded line
// op), so it does no auth check of its own; the wrapper's guarded runMutation
// already established salesAccess + draft status.
//
// tax/discount are operator fields (set on Proposal.draft), carried through
// unchanged; subtotal derives from the lines, and total = subtotal + tax -
// discount (the proposalTotalsConsistent invariant). All four values are 2dp, so
// the invariant holds exactly — same arithmetic path the draft command uses.
export const recomputeProposalTotals = internalMutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    // Only draft proposals have editable lines (the line commands guard on
    // status=="draft"); recompute refuses otherwise.
    if (proposal.status !== "draft") {
      throw new Error("Proposal pricing can only be recomputed while draft");
    }
    // JS loose-equality filter (governed-creation omits deletedAt at insert →
    // fresh active rows have it ABSENT, not null). Matches proposalRevision.ts.
    const lines = (
      await ctx.db
        .query("proposalLineItems")
        .withIndex("by_proposalId", (q: any) => q.eq(args.proposalId))
        .collect()
    ).filter((row) => row.deletedAt == null);

    const result = computeProposalPricing({
      lines: lines.map((l) => ({
        pricingBasis: l.pricingBasis as PricingBasis,
        unitPrice: Number(l.unitPrice) || 0,
        quantity: Number(l.quantity) || 0,
      })),
      guestCount: Number(proposal.guestCount) || 0,
      discountAmount: Number(proposal.discountAmount) || 0,
      taxAmount: Number(proposal.taxAmount) || 0,
    });

    // Restamp each line's authoritative amount (positional —
    // computeProposalPricing preserves input order; percentage lines re-resolve
    // against the new base), then the parent totals.
    await Promise.all(
      lines.map((l, i) =>
        ctx.db.patch(l._id, { amount: result.lines[i].amount }),
      ),
    );
    await ctx.db.patch(args.proposalId, {
      subtotal: result.subtotal,
      total: result.total,
    });
  },
});

// Add a priced line to a draft proposal, then recompute. The supplied `amount`
// is provisional (a caller cannot resolve a percentage line in isolation); the
// recompute restamps every line authoritatively.
export const addProposalLineAndRecompute = mutation({
  args: {
    proposalId: v.id("proposals"),
    description: v.string(),
    pricingBasis: v.string(),
    unitPrice: v.number(),
    amount: v.number(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(api.mutations.ProposalLineItem_createViaAddLine, {
      proposalId: args.proposalId,
      description: args.description,
      pricingBasis: args.pricingBasis,
      unitPrice: args.unitPrice,
      amount: args.amount,
      quantity: args.quantity,
      unit: args.unit,
      sortOrder: args.sortOrder,
      notes: args.notes,
    });
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId: args.proposalId,
    });
  },
});

// Revise a draft proposal line, then recompute. proposalId is read from the
// line doc so the recompute always targets the line's own proposal.
export const reviseProposalLineAndRecompute = mutation({
  args: {
    docId: v.id("proposalLineItems"),
    version: v.optional(v.number()),
    description: v.string(),
    pricingBasis: v.string(),
    unitPrice: v.number(),
    amount: v.number(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.docId);
    if (!line) throw new Error("Proposal line not found");
    await ctx.runMutation(api.mutations.ProposalLineItem_reviseLine, {
      docId: args.docId,
      version: args.version,
      description: args.description,
      pricingBasis: args.pricingBasis,
      unitPrice: args.unitPrice,
      amount: args.amount,
      quantity: args.quantity,
      unit: args.unit,
      sortOrder: args.sortOrder,
      notes: args.notes,
    });
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId: line.proposalId,
    });
  },
});

// Remove a draft proposal line, then recompute. Reads proposalId before the
// soft-delete (removeLine sets deletedAt) so recompute targets the right
// proposal; recompute's active-line filter then excludes the removed row.
export const removeProposalLineAndRecompute = mutation({
  args: {
    docId: v.id("proposalLineItems"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.docId);
    if (!line) throw new Error("Proposal line not found");
    await ctx.runMutation(api.mutations.ProposalLineItem_removeLine, {
      docId: args.docId,
      version: args.version,
    });
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId: line.proposalId,
    });
  },
});
