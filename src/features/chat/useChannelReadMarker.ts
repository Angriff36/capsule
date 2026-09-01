import { useCallback, useEffect, useRef } from "react";
import { useChatReadCursor } from "./useTeamChat";

type CursorFacts = {
  readonly lastReadAt: number | null;
};

/**
 * Turns "the reader reached the newest visible message" into a cursor move
 * for one event channel. The server upsert (convex/teamChatCursor.ts) owns
 * the row, so this only decides WHEN to call it: never while the channel's
 * summary is still loading (the reach is replayed once it is there), never
 * for a position the cursor already covers, and never twice for the same
 * position. Keyed by channel throughout, so a route change to another event
 * never spends channel A's timestamp on B.
 */
export function useChannelReadMarker(
  channelKey: string | null,
  summary: CursorFacts | null | undefined,
): (newestAt: number | null) => void {
  const moveCursor = useChatReadCursor();
  const pendingReach = useRef(new Map<string, number>());
  /** Highest position already sent per channel this session. */
  const sentUpTo = useRef(new Map<string, number>());

  const onReachBottom = useCallback(
    (newestAt: number | null) => {
      if (!channelKey || newestAt == null) return;
      if (summary === undefined) {
        pendingReach.current.set(channelKey, newestAt);
        return;
      }
      if (summary === null) return;
      const covered = Math.max(
        summary.lastReadAt ?? 0,
        sentUpTo.current.get(channelKey) ?? 0,
      );
      if (covered >= newestAt) return;
      sentUpTo.current.set(channelKey, newestAt);
      void moveCursor(channelKey, newestAt);
    },
    [channelKey, moveCursor, summary],
  );

  useEffect(() => {
    if (!channelKey || !summary) return;
    const newestAt = pendingReach.current.get(channelKey);
    if (newestAt === undefined) return;
    pendingReach.current.delete(channelKey);
    onReachBottom(newestAt);
  }, [summary, channelKey, onReachBottom]);

  return onReachBottom;
}
