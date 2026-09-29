/**
 * AUTHOR SEAM — the team-chat read cursor as ONE upsert.
 *
 * StaffChatReadCursor declares `unique [tenantId, channelKey, authSubjectId]`
 * but Convex enforces no alternate keys. This seam is the write path the UI
 * uses: it finds the caller's row for the channel and advances it (never
 * backwards), or creates the single row when none exists.
 * ~~and the generated creation command inserts a new row on every call. This
 * seam … folds any duplicates into it … Same raw-write posture as
 * convex/signatureAcceptance.ts and friends, with the domain event recorded
 * in manifestEvents.~~
 * 2026-09-29: both paths run the generated commands with the caller's auth —
 * StaffChatReadCursor.open (createViaOpen, which now refuses a second row for
 * the same channel and account) and StaffChatReadCursor.touch — and those
 * emit StaffChatChannelRead. Duplicates left by an old race are no longer
 * deleted: every cursor reader takes the furthest row, and so does this seam.
 */
import { v } from "convex/values";
import { api } from "./_generated/api";
import { mutation } from "./_generated/server";
import { chatAuth, CURSOR_DUPLICATES_CAP } from "./lib/teamChatRead";

export const markChannelRead = mutation({
  args: {
    /** `event:<eventId>` */
    channelKey: v.string(),
    /** Commit-time position of the newest message the reader saw. */
    readUpTo: v.number(),
  },
  handler: async (ctx, args) => {
    const auth = await chatAuth(ctx);
    if (!auth) throw new Error("Sign in to use team chat");
    const channelKey = args.channelKey.trim();
    if (channelKey.length === 0) throw new Error("Pick a chat first.");
    if (args.readUpTo > Date.now()) {
      throw new Error("This chat couldn't be marked as read. Try again.");
    }

    // The caller's own rows for this channel, directly (composite index);
    // more than one only from an old race.
    const mine = (
      await ctx.db
        .query("staffChatReadCursors")
        .withIndex("by_channelKey_and_authSubjectId", (q) =>
          q.eq("channelKey", channelKey).eq("authSubjectId", auth.id),
        )
        .take(CURSOR_DUPLICATES_CAP)
    ).filter((row) => row.tenantId === auth.tenantId);

    if (mine.length === 0) {
      const created = (await ctx.runMutation(
        api.mutations.StaffChatReadCursor_createViaOpen,
        { channelKey, readUpTo: args.readUpTo },
      )) as { docId?: string } | null;
      if (!created?.docId) {
        throw new Error("This chat couldn't be marked as read. Try again.");
      }
      return { cursorId: String(created.docId), lastReadAt: args.readUpTo };
    }

    // The row that has read the furthest is the cursor.
    const keep = mine.reduce((best, row) =>
      row.lastReadAt > best.lastReadAt ? row : best,
    );
    if (args.readUpTo > keep.lastReadAt) {
      await ctx.runMutation(api.mutations.StaffChatReadCursor_touch, {
        docId: keep._id,
        readUpTo: args.readUpTo,
      });
    }
    return {
      cursorId: String(keep._id),
      lastReadAt: Math.max(keep.lastReadAt, args.readUpTo),
    };
  },
});
