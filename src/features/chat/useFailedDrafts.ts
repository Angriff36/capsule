import type { ChatComposerDraft } from "./chatComposerDraft";

/**
 * Drafts whose send failed after the composer that held them was gone — the
 * user had switched channels, tabs, or pages. The composer is keyed by
 * channel, so it cannot restore them itself. Module scope: a draft kept on
 * the event Chat tab is handed back on /staff/messages?event=… too (same
 * channelKey), and a page unmount does not lose it.
 */
const store = new Map<string, ChatComposerDraft>();

export const failedDrafts = {
  peek: (channelKey: string): ChatComposerDraft | null =>
    store.get(channelKey) ?? null,
  keep: (channelKey: string, draft: ChatComposerDraft): void => {
    store.set(channelKey, draft);
  },
  forget: (channelKey: string): void => {
    store.delete(channelKey);
  },
};
