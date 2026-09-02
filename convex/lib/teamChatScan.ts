/**
 * AUTHOR SEAM helpers for convex/teamChat.ts — walks over one event channel.
 * Newest first, live rows only, and every walk stops at the retention
 * boundary; removed rows are skipped without spending the budget.
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { live, sentAt, UNREAD_SCAN } from "./teamChatRead";

/** Rows (live or not) walked per channel before giving up. */
export const CHANNEL_WALK_CAP = 2000;

/**
 * Newest-first LIVE rows of one event channel inside the window, at most
 * `limit`. A walk, not a raw take: removed rows are skipped without eating
 * the budget, and it stops at the retention boundary.
 */
export async function channelRows(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
  since: number,
  limit: number,
): Promise<Doc<"staffMessages">[]> {
  const out: Doc<"staffMessages">[] = [];
  let walked = 0;
  const range = ctx.db
    .query("staffMessages")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc");
  for await (const row of range) {
    if (++walked > CHANNEL_WALK_CAP) break;
    if (sentAt(row) < since) break;
    if (row.tenantId !== tenantId || !live(row)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

export type ChannelScan = {
  /** Newest live row in the window, if any. */
  newest: Doc<"staffMessages"> | undefined;
  /** Live rows counted (up to `countLimit`); meaningful when `stopAtCursor` is false. */
  count: number;
  countCapped: boolean;
  /** Live rows newer than the cursor, not sent by the caller (up to UNREAD_SCAN). */
  unread: number;
  unreadCapped: boolean;
  /** Rows (live or not) the walk read — for a caller's aggregate budget. */
  walked: number;
};

/**
 * One pass over a channel, newest first, for badges and headers. Counts
 * unread rows until UNREAD_SCAN is reached ("50+"), skips removed rows
 * without spending the budget, and stops at the retention boundary, at the
 * caller's read cursor when `stopAtCursor` (everything older is read), at
 * `countLimit` live rows, or at CHANNEL_WALK_CAP rows walked.
 */
export async function scanChannel(
  ctx: QueryCtx,
  tenantId: string,
  eventId: Id<"events">,
  opts: {
    since: number;
    readUpTo: number;
    me: Id<"people"> | null;
    stopAtCursor: boolean;
    /** Live rows examined before the count reads as capped. */
    countLimit: number;
    /**
     * Rows walked, live or not, before giving up — the caller's physical
     * budget for Convex's document limits; defaults to CHANNEL_WALK_CAP.
     * Removed rows spend only this, never the live-row limits.
     */
    walkCap?: number;
  },
): Promise<ChannelScan> {
  const scan: ChannelScan = {
    newest: undefined,
    count: 0,
    countCapped: false,
    unread: 0,
    unreadCapped: false,
    walked: 0,
  };
  const walkCap = opts.walkCap ?? CHANNEL_WALK_CAP;
  let walked = 0;
  const range = ctx.db
    .query("staffMessages")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .order("desc");
  for await (const row of range) {
    scan.walked = walked;
    if (++walked > walkCap) {
      scan.countCapped = true;
      scan.unreadCapped = scan.unreadCapped || sentAt(row) > opts.readUpTo;
      break;
    }
    scan.walked = walked;
    if (sentAt(row) < opts.since) break;
    if (row.tenantId !== tenantId || !live(row)) continue;
    if (!scan.newest) scan.newest = row;
    const beyondCursor = sentAt(row) > opts.readUpTo;
    if (opts.stopAtCursor && !beyondCursor) break;
    scan.count += 1;
    if (
      beyondCursor &&
      !scan.unreadCapped &&
      (opts.me == null || row.senderPersonId !== opts.me)
    ) {
      scan.unread += 1;
      if (scan.unread >= UNREAD_SCAN) {
        scan.unreadCapped = true;
        if (opts.stopAtCursor) break;
      }
    }
    if (scan.count >= opts.countLimit) {
      scan.countCapped = true;
      break;
    }
  }
  return scan;
}
