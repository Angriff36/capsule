import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChatComposerDraft } from "./chatComposerDraft";
import { failedDrafts } from "./useFailedDrafts";

export type ChatDraftRestore = {
  readonly channelKey: string;
  readonly draft: ChatComposerDraft;
  /** Store items the merged draft covers — consumed once the composer took it. */
  readonly count: number;
  readonly token: number;
};

/**
 * Recovers drafts whose send failed after their composer was gone. The
 * composer reports the orphan and the draft joins the channel's list in the
 * module store. The composer for that channel seeds itself from the items
 * present when it mounts (`initialDraft`, consumed on its mount); anything
 * kept after that — while the page showed a skeleton, between render and
 * subscription, or while the channel is on screen — is offered to the live
 * composer as a merge (`restoreDraft`) and consumed once taken. Items are
 * only ever removed after a composer has them, so nothing is lost when the
 * user leaves early, and each item is handed out exactly once.
 */
export function useChatDraftRecovery(channelKey: string) {
  const channelRef = useRef(channelKey);
  channelRef.current = channelKey;
  // Layout effect: the flag flips during the unmount commit, before any
  // promise continuation can resume. Armed in the setup too (StrictMode).
  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const tokenRef = useRef(0);
  const [restore, setRestore] = useState<ChatDraftRestore | null>(null);

  // Items present when this channel was opened; the keyed composer seeds
  // itself from their merge on mount. Held across renders (the composer may
  // mount later than this hook while the page shows a skeleton).
  const initial = useMemo(
    () => (channelKey ? failedDrafts.peek(channelKey) : null),
    [channelKey],
  );
  /** Items the composer will take from `initialDraft`; 0 once it has. */
  const seededCountRef = useRef(initial?.count ?? 0);
  useLayoutEffect(() => {
    seededCountRef.current = initial?.count ?? 0;
  }, [initial]);
  const onInitialDraftConsumed = useCallback(() => {
    if (!channelKey) return;
    failedDrafts.consume(channelKey, seededCountRef.current);
    seededCountRef.current = 0;
  }, [channelKey]);

  // Offer the live composer whatever the store holds beyond the seed.
  const offer = useCallback((changedKey: string) => {
    if (!mountedRef.current || changedKey !== channelRef.current) return;
    const rest = failedDrafts.peek(changedKey, seededCountRef.current);
    if (!rest) return;
    tokenRef.current += 1;
    setRestore({
      channelKey: changedKey,
      draft: rest.draft,
      count: rest.count,
      token: tokenRef.current,
    });
  }, []);
  useEffect(() => {
    const unsubscribe = failedDrafts.subscribe(offer);
    // Anything kept between this render and now had no listener yet.
    if (channelKey) offer(channelKey);
    return unsubscribe;
  }, [offer, channelKey]);

  const orphanedFrom = useCallback(
    (sentFrom: string, draft: ChatComposerDraft) => {
      failedDrafts.keep(sentFrom, draft);
    },
    [],
  );

  const onRestoreConsumed = useCallback(() => {
    setRestore((current) => {
      if (current) failedDrafts.consume(current.channelKey, current.count);
      return null;
    });
  }, []);

  return {
    initialDraft: initial?.draft ?? null,
    onInitialDraftConsumed,
    /** Only the composer of the matching channel receives it. */
    restoreDraft: restore && restore.channelKey === channelKey ? restore : null,
    orphanedFrom,
    onRestoreConsumed,
  };
}
