/**
 * AUTHOR SEAM — the team-chat read cursor as ONE upsert.
 *
 * StaffChatReadCursor declares `unique [tenantId, channelKey, authSubjectId]`
 * but Convex enforces no alternate keys, and the generated creation command
 * inserts a new row on every call. This seam is the write path the UI uses:
 * it finds the caller's row for the channel, advances it (never backwards),
 * folds any duplicates into it, or inserts the single row when none exists.
 * Same raw-write posture as convex/signatureAcceptance.ts and friends, with
 * the domain event recorded in manifestEvents.
 */
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { chatAuth, CURSOR_ROWS_PER_CHANNEL } from "./lib/teamChatRead";

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
    if (channelKey.length === 0) throw new Error("Channel is required");
    const now = Date.now();
    if (args.readUpTo > now) {
      throw new Error("Read position cannot be in the future");
    }

    const rows = await ctx.db
      .query("staffChatReadCursors")
      .withIndex("by_channelKey", (q) => q.eq("channelKey", channelKey))
      .take(CURSOR_ROWS_PER_CHANNEL);
    const mine = rows.filter(
      (row) => row.tenantId === auth.tenantId && row.authSubjectId === auth.id,
    );

    if (mine.length === 0) {
      const cursorId = await ctx.db.insert("staffChatReadCursors", {
        tenantId: auth.tenantId,
        channelKey,
        authSubjectId: auth.id,
        lastReadAt: args.readUpTo,
        createdAt: now,
        updatedAt: now,
        version: 1,
      });
      await ctx.db.insert("manifestEvents", {
        type: "StaffChatChannelRead",
        entity: "StaffChatReadCursor",
        entityId: cursorId,
        payload: {
          staffChatReadCursorId: cursorId,
          tenantId: auth.tenantId,
          channelKey,
          authSubjectId: auth.id,
        },
        createdAt: now,
      });
      return { cursorId: String(cursorId), lastReadAt: args.readUpTo };
    }

    // Keep the row that has read the furthest; fold the rest into it.
    const keep = mine.reduce((best, row) =>
      row.lastReadAt > best.lastReadAt ? row : best,
    );
    const lastReadAt = Math.max(keep.lastReadAt, args.readUpTo);
    if (lastReadAt !== keep.lastReadAt) {
      await ctx.db.patch(keep._id, {
        lastReadAt,
        updatedAt: now,
        version: keep.version + 1,
      });
      await ctx.db.insert("manifestEvents", {
        type: "StaffChatChannelRead",
        entity: "StaffChatReadCursor",
        entityId: keep._id,
        payload: {
          staffChatReadCursorId: keep._id,
          tenantId: auth.tenantId,
          channelKey,
          authSubjectId: auth.id,
        },
        createdAt: now,
      });
    }
    for (const duplicate of mine) {
      if (duplicate._id !== keep._id) await ctx.db.delete(duplicate._id);
    }
    return { cursorId: String(keep._id), lastReadAt };
  },
});
