/**
 * AUTHOR SEAM - the receipt of the newest step this person ran on a record.
 *
 * A record page watches it: when a step the person just ran set off other
 * records (an approval making purchase needs, a pack list, production
 * batches), the page says so once, with links. The receipt itself is read
 * from the stored event rows (convex/lib/cascadeReceipt.ts).
 */
import { v } from "convex/values";
import type { Id, TableNames } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { cascadeReceiptFor } from "./lib/cascadeReceipt";

export const latestCascadeReceipt = query({
  args: { recordId: v.string() },
  handler: async (ctx, { recordId }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.id) return null;
    let record: { tenantId?: unknown } | null = null;
    try {
      record = (await ctx.db.get(recordId as Id<TableNames>)) as {
        tenantId?: unknown;
      } | null;
    } catch {
      return null;
    }
    if (!record || record.tenantId !== auth.tenantId) return null;
    const newest = await ctx.db
      .query("manifestEvents")
      .withIndex("by_entityId", (q) => q.eq("entityId", recordId))
      .order("desc")
      .first();
    if (!newest) return null;
    const receipt = await cascadeReceiptFor(ctx, auth.tenantId, newest);
    if (!receipt || receipt.actorUserId !== auth.id) return null;
    return receipt;
  },
});
