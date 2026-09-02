import { useSyncExternalStore } from "react";
import type { ChatComposerSubmit } from "./chatComposerTypes";
import { type ChatChannel, chatChannelKey } from "./chatTypes";

/**
 * Messages whose send failed. They never go back into the composer: what the
 * user typed since stays the next message, and the failed one stays its own
 * operation — a "Not sent" row above the composer with Retry and Discard. A
 * retry sends the identical submit under its original idempotency key, so a
 * first attempt that committed but lost its response is not sent twice, and
 * nothing typed later can ride along with it.
 *
 * Module scope: the row follows the channel between the event Chat tab and
 * /staff/messages (same channel key) and survives either page unmounting.
 */
export type UnsentDraft = {
  readonly id: string;
  readonly channel: ChatChannel;
  readonly submit: ChatComposerSubmit;
  readonly error: string;
  /** A retry is in flight. */
  readonly sending: boolean;
};

const EMPTY: readonly UnsentDraft[] = [];
const store = new Map<string, readonly UnsentDraft[]>();
const listeners = new Set<() => void>();
let nextId = 0;

function set(channelKey: string, items: readonly UnsentDraft[]): void {
  if (items.length === 0) store.delete(channelKey);
  else store.set(channelKey, items);
  for (const listener of listeners) listener();
}

/** Replace one item (null removes it); no notification when unchanged. */
function update(
  id: string,
  patch: (item: UnsentDraft) => UnsentDraft | null,
): void {
  for (const [channelKey, items] of store) {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) continue;
    const current = items[index]!;
    const next = patch(current);
    if (next === current) return;
    set(
      channelKey,
      next === null
        ? items.filter((_, position) => position !== index)
        : items.map((item, position) => (position === index ? next : item)),
    );
    return;
  }
}

export const unsentDrafts = {
  keep(channel: ChatChannel, submit: ChatComposerSubmit, error: string): void {
    const channelKey = chatChannelKey(channel);
    nextId += 1;
    set(channelKey, [
      ...(store.get(channelKey) ?? EMPTY),
      { id: `unsent-${nextId}`, channel, submit, error, sending: false },
    ]);
  },
  /** Marks a retry in flight; false when the item is gone or already sending. */
  begin(id: string): boolean {
    let began = false;
    update(id, (item) => {
      if (item.sending) return item;
      began = true;
      return { ...item, sending: true };
    });
    return began;
  },
  fail(id: string, error: string): void {
    update(id, (item) => ({ ...item, error, sending: false }));
  },
  remove(id: string): void {
    update(id, () => null);
  },
  read(channelKey: string): readonly UnsentDraft[] {
    return store.get(channelKey) ?? EMPTY;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** The channel's unsent messages, oldest first; re-renders on every change. */
export function useUnsentDrafts(channelKey: string): readonly UnsentDraft[] {
  return useSyncExternalStore(
    unsentDrafts.subscribe,
    () => unsentDrafts.read(channelKey),
    () => EMPTY,
  );
}

export function sendFailureReason(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "The message was not sent.";
}
