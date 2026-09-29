/**
 * AUTHOR SEAM — the per-account team-chat push preference.
 *
 * One row per sign-in (ownerId = auth subject). `set` is an upsert: the
 * declared `unique [tenantId, ownerId]` is not enforced by Convex.
 * ~~there is no generated create path (the entity's write/execute are locked
 * to a capability no role holds), so this seam is the only writer.~~
 * 2026-09-29: `set` runs the generated ChatNotifyPreference commands —
 * `create` for the account's first choice (it refuses a second row) and
 * `setEnabled` after that. Rows duplicated by an old race are left alone:
 * every reader and this writer use the first row of the owner's index page.
 * `mine` returns whether the account wants team-chat notifications,
 * defaulting to off.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

/** Rows one owner may have (duplicates from a past race). */
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
    const keep = (
      await ctx.db
        .query("chatNotifyPreferences")
        .withIndex("by_ownerId", (q) => q.eq("ownerId", auth.id))
        .take(OWNER_DUPLICATES_CAP)
    ).find((r) => r.tenantId === auth.tenantId);

    if (keep) {
      if (keep.enabled !== args.enabled) {
        await ctx.runMutation(api.mutations.ChatNotifyPreference_setEnabled, {
          docId: keep._id,
          enabled: args.enabled,
        });
      }
      return { enabled: args.enabled };
    }

    await ctx.runMutation(api.mutations.ChatNotifyPreference_create, {
      enabled: args.enabled,
    });
    return { enabled: args.enabled };
  },
});
