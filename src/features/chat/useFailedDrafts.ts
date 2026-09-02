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
 * channelKey), and a page unmount does not lose it.
 *
 * Each channel holds a LIST of failed drafts, oldest first. Readers take a
 * merged view of the items they can see and later consume exactly that many,
 * so a draft parked while a composer was seeding itself is neither dropped
 * nor duplicated. Observable, so a page already showing the channel merges a
 * new arrival at once.
 */
const store = new Map<string, ChatComposerDraft[]>();
const listeners = new Set<(channelKey: string) => void>();

function mergeAll(items: readonly ChatComposerDraft[]): ChatComposerDraft {
  // Two merged attempts are a new operation: no key carries over, so the
  // retry cannot be de-duplicated against either original. A single item
  // keeps its key.
  if (items.length === 1) return items[0]!;
  return items.reduce((older, newer) => ({
    text: restoreDraftText(older.text, newer.text),
    files: restoreDraftFiles(older.files, newer.files),
    links: restoreDraftLinks(older.links, newer.links),
    mentions: restoreDraftMentions(older.mentions, newer.mentions),
  }));
}

export type FailedDraftView = {
  /** All visible items merged, oldest first. */
  readonly draft: ChatComposerDraft;
  /** How many items the view covers — pass back to consume(). */
  readonly count: number;
};

export const failedDrafts = {
  /** The items for a channel after the first `skip`, merged; null when none. */
  peek: (channelKey: string, skip = 0): FailedDraftView | null => {
    const items = (store.get(channelKey) ?? []).slice(skip);
    if (items.length === 0) return null;
    return { draft: mergeAll(items), count: items.length };
  },
  keep: (channelKey: string, draft: ChatComposerDraft): void => {
    const items = store.get(channelKey) ?? [];
    items.push(draft);
    store.set(channelKey, items);
    for (const listener of listeners) listener(channelKey);
  },
  /** Drop the oldest `count` items — the ones a view handed to a composer. */
  consume: (channelKey: string, count: number): void => {
    const items = store.get(channelKey);
    if (!items) return;
    items.splice(0, count);
    if (items.length === 0) store.delete(channelKey);
  },
  /** Called with the channelKey after every keep(). Returns the unsubscribe. */
  subscribe: (listener: (channelKey: string) => void): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
