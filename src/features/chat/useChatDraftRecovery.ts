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
  // Mirror for callbacks: updaters must stay pure (StrictMode runs them twice).
  const restoreRef = useRef<ChatDraftRestore | null>(null);
  restoreRef.current = restore;

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

  // Offer the live composer whatever the store holds beyond the seed — one
  // hand-off at a time: while an offer is outstanding, a new keep() waits
  // until the composer has acknowledged the current one, so no item is ever
  // merged twice or consumed unmerged.
  const outstandingRef = useRef(false);
  const offer = useCallback((changedKey: string) => {
    if (!mountedRef.current || changedKey !== channelRef.current) return;
    if (outstandingRef.current) return;
    const rest = failedDrafts.peek(changedKey, seededCountRef.current);
    if (!rest) return;
    tokenRef.current += 1;
    outstandingRef.current = true;
    const next: ChatDraftRestore = {
      channelKey: changedKey,
      draft: rest.draft,
      count: rest.count,
      token: tokenRef.current,
    };
    restoreRef.current = next;
    setRestore(next);
  }, []);
  useEffect(() => {
    const unsubscribe = failedDrafts.subscribe(offer);
    // A hand-off offered to the previous channel's composer is moot here.
    outstandingRef.current = false;
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

  const onRestoreConsumed = useCallback(
    (token: number) => {
      const current = restoreRef.current;
      if (!current || current.token !== token) return;
      failedDrafts.consume(current.channelKey, current.count);
      outstandingRef.current = false;
      restoreRef.current = null;
      setRestore(null);
      // Anything kept while this offer was outstanding goes next.
      offer(current.channelKey);
    },
    [offer],
  );

  return {
    initialDraft: initial?.draft ?? null,
    onInitialDraftConsumed,
    /** Only the composer of the matching channel receives it. */
    restoreDraft: restore && restore.channelKey === channelKey ? restore : null,
    orphanedFrom,
    onRestoreConsumed,
  };
}
