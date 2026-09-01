import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatComposerDraft } from "./chatComposerDraft";
import { failedDrafts } from "./useFailedDrafts";

export type ChatDraftRestore = {
  readonly channelKey: string;
  readonly draft: ChatComposerDraft;
  readonly token: number;
};

/**
 * Recovers a draft whose send failed after its composer was gone. The
 * composer reports the orphan (it is keyed by channel and unmounts on a
 * switch) and the draft goes to the module store. Whoever is showing that
 * channel when the store changes — this page, or a page that replaced it —
 * merges the draft into its live composer and clears the entry; otherwise
 * the entry seeds the composer the next time the channel opens, and stays
 * until a composer reports that it took it in.
 */
export function useChatDraftRecovery(channelKey: string) {
  const channelRef = useRef(channelKey);
  channelRef.current = channelKey;
  // Armed in the setup, not only cleared in the cleanup: StrictMode runs
  // setup → cleanup → setup on mount and keeps refs.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const tokenRef = useRef(0);
  const [restore, setRestore] = useState<ChatDraftRestore | null>(null);

  // Peeked once per channel and held: the composer may mount a render later
  // than this hook (the page shows a skeleton until its queries load).
  const initialDraft = useMemo(
    () => (channelKey ? failedDrafts.peek(channelKey) : null),
    [channelKey],
  );
  const onInitialDraftConsumed = useCallback(() => {
    if (channelKey) failedDrafts.forget(channelKey);
  }, [channelKey]);

  // A draft kept for the channel on screen — by this page's own composer or
  // by an older one that failed after this page took over — is merged live.
  useEffect(
    () =>
      failedDrafts.subscribe((changedKey) => {
        if (!mountedRef.current || changedKey !== channelRef.current) return;
        const draft = failedDrafts.peek(changedKey);
        if (!draft) return;
        tokenRef.current += 1;
        setRestore({ channelKey: changedKey, draft, token: tokenRef.current });
      }),
    [],
  );

  const orphanedFrom = useCallback(
    (sentFrom: string, draft: ChatComposerDraft) => {
      failedDrafts.keep(sentFrom, draft);
    },
    [],
  );

  const onRestoreConsumed = useCallback(() => {
    setRestore((current) => {
      if (current) failedDrafts.forget(current.channelKey);
      return null;
    });
  }, []);

  return {
    initialDraft,
    onInitialDraftConsumed,
    /** Only the composer of the matching channel receives it. */
    restoreDraft: restore && restore.channelKey === channelKey ? restore : null,
    orphanedFrom,
    onRestoreConsumed,
  };
}
