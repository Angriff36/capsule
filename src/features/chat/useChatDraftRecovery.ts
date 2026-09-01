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
 * switch). The draft is ALWAYS written to the module store first — the page
 * itself may be gone by the time the send fails — and then, if the user is
 * back on that channel with this page still mounted, the live composer
 * merges it in and the store entry is cleared. Otherwise it seeds the
 * composer the next time that channel opens anywhere.
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
  // than this hook (the page shows a skeleton until its queries load), after
  // the store entry has already been forgotten below.
  const initialDraft = useMemo(
    () => (channelKey ? failedDrafts.peek(channelKey) : null),
    [channelKey],
  );
  useEffect(() => {
    if (channelKey) failedDrafts.forget(channelKey);
  }, [channelKey]);

  const orphanedFrom = useCallback(
    (sentFrom: string, draft: ChatComposerDraft) => {
      failedDrafts.keep(sentFrom, draft);
      if (mountedRef.current && channelRef.current === sentFrom) {
        tokenRef.current += 1;
        setRestore({ channelKey: sentFrom, draft, token: tokenRef.current });
      }
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
    /** Only the composer of the matching channel receives it. */
    restoreDraft: restore && restore.channelKey === channelKey ? restore : null,
    orphanedFrom,
    onRestoreConsumed,
  };
}
