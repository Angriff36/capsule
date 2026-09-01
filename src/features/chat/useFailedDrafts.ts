import {
  restoreDraftFiles,
  restoreDraftLinks,
  restoreDraftMentions,
  restoreDraftText,
  type ChatComposerDraft,
} from "./chatComposerDraft";

/**
 * Drafts whose send failed after the composer that held them was gone — the
 * user had switched channels, tabs, or pages. The composer is keyed by
 * channel, so it cannot restore them itself. Module scope: a draft kept on
 * the event Chat tab is handed back on /staff/messages?event=… too (same
 * channelKey), and a page unmount does not lose it. Two failures for one
 * channel merge (older first) instead of the later one replacing the first.
 */
const store = new Map<string, ChatComposerDraft>();

export const failedDrafts = {
  peek: (channelKey: string): ChatComposerDraft | null =>
    store.get(channelKey) ?? null,
  keep: (channelKey: string, draft: ChatComposerDraft): void => {
    const prior = store.get(channelKey);
    store.set(
      channelKey,
      prior
        ? {
            text: restoreDraftText(prior.text, draft.text),
            files: restoreDraftFiles(prior.files, draft.files),
            links: restoreDraftLinks(prior.links, draft.links),
            mentions: restoreDraftMentions(prior.mentions, draft.mentions),
          }
        : draft,
    );
  },
  forget: (channelKey: string): void => {
    store.delete(channelKey);
  },
};
