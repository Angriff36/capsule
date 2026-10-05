/**
 * AUTHOR SEAM — put the dishes a client approved at a tasting on a proposal menu.
 *
 * Each approved dish becomes a proposal menu pick through the generated
 * ProposalDishSelection.select command, so its rules and permissions apply
 * unchanged. Dishes already on the proposal are skipped, so a second click or
 * a retry never adds a dish twice. Picks are sized for the proposal's guest
 * count (the tasting portions only size the tasting itself).
 */
import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

export const applyApprovedSelections = mutation({
  args: { tastingId: v.id("tastings"), proposalId: v.id("proposals") },
  handler: async (ctx, args): Promise<{ added: number; approved: number }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const [tasting, proposal] = await Promise.all([
      ctx.db.get(args.tastingId),
      ctx.db.get(args.proposalId),
    ]);
    if (!tasting || tasting.tenantId !== tenantId || tasting.deletedAt != null)
      throw new ConvexError("This tasting is not in your workspace.");
    if (
      !proposal ||
      proposal.tenantId !== tenantId ||
      proposal.deletedAt != null
    )
      throw new ConvexError("This proposal is not in your workspace.");
    const approved = (
      await ctx.db
        .query("tastingDishes")
        .withIndex("by_tastingId", (q) => q.eq("tastingId", args.tastingId))
        .collect()
    ).filter(
      (row) =>
        row.tenantId === tenantId &&
        row.deletedAt == null &&
        row.decision === "approved",
    );
    if (approved.length === 0)
      throw new ConvexError(
        "Mark at least one dish as approved before you add the selections to a proposal.",
      );
    const onProposal = new Set(
      (
        await ctx.db
          .query("proposalDishSelections")
          .withIndex("by_proposalId", (q) =>
            q.eq("proposalId", args.proposalId),
          )
          .collect()
      )
        .filter((row) => row.tenantId === tenantId && row.deletedAt == null)
        .map((row) => String(row.dishId)),
    );
    let added = 0;
    for (const row of approved) {
      if (!onProposal.has(String(row.dishId))) {
        await ctx.runMutation(
          api.mutations.ProposalDishSelection_createViaSelect,
          {
            proposalId: args.proposalId,
            menuId: row.menuId,
            dishId: row.dishId,
            quantityServings:
              proposal.guestCount > 0 ? proposal.guestCount : row.portionCount,
            specialInstructions: row.clientFeedback ?? undefined,
          },
        );
        onProposal.add(String(row.dishId));
        added += 1;
      }
      if (row.appliedToProposalId !== args.proposalId)
        await ctx.runMutation(api.mutations.TastingDish_markOnProposal, {
          docId: row._id,
          proposalId: args.proposalId,
        });
    }
    await ctx.runMutation(api.mutations.Tasting_markSelectionsApplied, {
      docId: args.tastingId,
      proposalId: args.proposalId,
    });
    return { added, approved: approved.length };
  },
});
