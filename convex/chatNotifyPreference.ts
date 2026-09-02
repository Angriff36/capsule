/**
 * AUTHOR SEAM — the per-account team-chat push preference.
 *
 * One row per sign-in (ownerId = auth subject). `set` is an upsert: the
 * declared `unique [tenantId, ownerId]` is not enforced by Convex and there is
 * no generated create path (the entity's write/execute are locked to a
 * capability no role holds), so this seam is the only writer. `mine` returns
 * whether the account wants team-chat notifications, defaulting to off.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

/** Rows one owner may have (duplicates from a race are folded). */
const OWNER_DUPLICATES_CAP = 10;

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.id) return false;
    const rows = await ctx.db
      .query("chatNotifyPreferences")
      .withIndex("by_ownerId", (q) => q.eq("ownerId", auth.id))
      .take(OWNER_DUPLICATES_CAP);
    const row = rows.find((r) => r.tenantId === auth.tenantId);
    return row?.enabled ?? false;
  },
});

export const set = mutation({
  args: { enabled: v.boolean() },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.role === "anonymous" || !auth.id) {
      throw new Error("Sign in to change notification settings");
    }
    const now = Date.now();
    const rows = (
      await ctx.db
        .query("chatNotifyPreferences")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", auth.id))
        .take(OWNER_DUPLICATES_CAP)
    ).filter((r) => r.tenantId === auth.tenantId);

    const keep = rows[0];
    if (keep) {
      if (keep.enabled !== args.enabled) {
        await ctx.db.patch(keep._id, {
          enabled: args.enabled,
          updatedAt: now,
          version: keep.version + 1,
        });
      }
      // Fold any duplicate rows from a past race into the one we keep.
      for (const duplicate of rows) {
        if (duplicate._id !== keep._id) await ctx.db.delete(duplicate._id);
      }
      return { enabled: args.enabled };
    }

    await ctx.db.insert("chatNotifyPreferences", {
      tenantId: auth.tenantId,
      ownerId: auth.id,
      enabled: args.enabled,
      createdAt: now,
      updatedAt: now,
      version: 1,
    });
    return { enabled: args.enabled };
  },
});
