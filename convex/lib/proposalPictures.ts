// AC-654 (BE-20.1-02 "supported visual content"): the dish pictures a
// proposal shows. A dish is on the proposal through a priced line linked to a
// menu dish (how a proposal built from an event carries its menu) or through a
// dish pick. Same company, live dishes with a picture only; one picture per
// dish, in line order, then pick order. The send freezes this list into the
// revision; drafts read it live.

import { query, type QueryCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

export type ProposalPictureRef = {
  dishId: string;
  dishName: string;
  storageId: string;
};

export async function proposalPictureRefs(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"proposals">,
): Promise<ProposalPictureRef[]> {
  const dishIds: Id<"dishes">[] = [];
  const lines = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
      .collect()
  )
    .filter((row) => row.deletedAt == null && row.removedAt == null && row.menuDishId)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));
  for (const line of lines) {
    const menuDishId = ctx.db.normalizeId("menuDishes", line.menuDishId!);
    const menuDish = menuDishId ? await ctx.db.get(menuDishId) : null;
    if (menuDish && menuDish.tenantId === proposal.tenantId) dishIds.push(menuDish.dishId);
  }
  const picks = await ctx.db
    .query("proposalDishSelections")
    .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
    .collect();
  for (const pick of picks) if (pick.deletedAt == null) dishIds.push(pick.dishId);

  const refs: ProposalPictureRef[] = [];
  const seen = new Set<string>();
  for (const dishId of dishIds) {
    if (seen.has(String(dishId))) continue;
    seen.add(String(dishId));
    const dish = await ctx.db.get(dishId);
    if (!dish || dish.tenantId !== proposal.tenantId || dish.deletedAt != null) continue;
    if (!dish.primaryImageStorageId) continue;
    refs.push({ dishId: String(dish._id), dishName: dish.name, storageId: dish.primaryImageStorageId });
  }
  return refs;
}

/** A draft's dish pictures with their addresses, for the proposal file. */
export const forProposal = query({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, { proposalId }) => {
    // The generated read applies the sales read policy and the workspace.
    const proposal = await ctx.runQuery(api.queries.getProposal, { id: proposalId });
    if (!proposal) return [];
    const refs = await proposalPictureRefs(ctx, proposal);
    return await Promise.all(
      refs.map(async (ref) => {
        const id = ctx.db.system.normalizeId("_storage", ref.storageId);
        return { ...ref, imageUrl: id ? await ctx.storage.getUrl(id) : null };
      }),
    );
  },
});
