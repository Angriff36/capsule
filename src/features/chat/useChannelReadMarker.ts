import { useCallback, useEffect, useRef } from "react";
import { useChatReadCursor } from "./useTeamChat";

type CursorFacts = {
  readonly myCursorId: string | null;
  readonly lastReadAt: number | null;
};

/**
 * Turns "the reader reached the newest visible message" into a cursor move
 * for one event channel. Keyed by channel throughout, so a route change to
 * another event never spends channel A's timestamp or cursor id on B:
 * - a reach that arrives before the channel's summary loads is replayed
 *   once the summary is there;
 * - a cursor opened this session is remembered per channel until the
 *   summary query catches up, so no duplicate rows are opened.
 */
export function useChannelReadMarker(
  channelKey: string | null,
  summary: CursorFacts | null | undefined,
): (newestAt: number | null) => void {
  const moveCursor = useChatReadCursor();
  const openedCursors = useRef(new Map<string, string>());
  const pendingReach = useRef(new Map<string, number>());

  const onReachBottom = useCallback(
    (newestAt: number | null) => {
      if (!channelKey || newestAt == null) return;
      if (summary === undefined) {
        pendingReach.current.set(channelKey, newestAt);
        return;
      }
      if (summary === null) return;
      const cursorId =
        summary.myCursorId ?? openedCursors.current.get(channelKey) ?? null;
      if (cursorId && (summary.lastReadAt ?? 0) >= newestAt) return;
      void moveCursor(channelKey, cursorId, newestAt).then((id) => {
        if (id) openedCursors.current.set(channelKey, id);
      });
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
