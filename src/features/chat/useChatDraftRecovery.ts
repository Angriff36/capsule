import { useCallback, useEffect, useRef, useState } from "react";
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
 * switch); if the user is back on that channel the live composer merges it
 * in, otherwise it waits in the module store and seeds the composer the next
 * time that channel opens.
 */
export function useChatDraftRecovery(channelKey: string) {
  const channelRef = useRef(channelKey);
  channelRef.current = channelKey;
  const tokenRef = useRef(0);
  const [restore, setRestore] = useState<ChatDraftRestore | null>(null);

  // Read during render, forgotten after mount: the keyed composer seeds
  // itself from it exactly once.
  const initialDraft = channelKey ? failedDrafts.peek(channelKey) : null;
  useEffect(() => {
    if (channelKey) failedDrafts.forget(channelKey);
  }, [channelKey]);

  const orphanedFrom = useCallback(
    (sentFrom: string, draft: ChatComposerDraft) => {
      if (channelRef.current === sentFrom) {
        tokenRef.current += 1;
        setRestore({ channelKey: sentFrom, draft, token: tokenRef.current });
      } else {
        failedDrafts.keep(sentFrom, draft);
      }
    },
    [],
  );

  const onRestoreConsumed = useCallback(() => setRestore(null), []);

  return {
    initialDraft,
    /** Only the composer of the matching channel receives it. */
    restoreDraft: restore && restore.channelKey === channelKey ? restore : null,
    orphanedFrom,
    onRestoreConsumed,
  };
}
