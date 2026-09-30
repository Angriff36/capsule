/**
 * AUTHOR SEAM — one packer for each section of a pack list.
 *
 * Taking a section gives back whoever had it and takes it for the caller in
 * one transaction, so a section is never left with nobody after a failed
 * take-over and never has two packers after two people press at the same
 * moment (the second press sees the first one's row and replaces it).
 * Both steps are the generated PackSectionClaim commands; their rules and
 * permissions apply unchanged.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";

export const take = mutation({
  args: { packListId: v.id("packLists"), sectionKey: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const live = (
      await ctx.db
        .query("packSectionClaims")
        .withIndex("by_packListId", (q) => q.eq("packListId", args.packListId))
        .collect()
    ).filter(
      (row) =>
        row.tenantId === tenantId &&
        row.deletedAt == null &&
        row.sectionKey === args.sectionKey &&
        row.claimedAt != null &&
        row.releasedAt == null,
    );
    for (const row of live)
      await ctx.runMutation(api.mutations.PackSectionClaim_release, {
        docId: row._id,
      });
    await ctx.runMutation(api.mutations.PackSectionClaim_createViaTake, {
      packListId: args.packListId,
      sectionKey: args.sectionKey,
    });
    return null;
  },
});
