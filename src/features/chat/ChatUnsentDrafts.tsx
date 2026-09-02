import { useRef } from "react";
import { type ChatChannel, chatChannelKey } from "./chatTypes";
import { useSendChatMessage } from "./useTeamChat";
import {
  sendFailureReason,
  type UnsentDraft,
  unsentDrafts,
  useUnsentDrafts,
} from "./useUnsentDrafts";
import "./chat.css";

type Props = {
  readonly channel: ChatChannel;
  /** A retry succeeded while this channel is still on screen — pin the thread. */
  readonly onSent?: () => void;
};

function previewOf(item: UnsentDraft): string {
  const { text, files, links } = item.submit.draft;
  const parts = [text.trim()];
  if (files.length === 1) parts.push(files[0]!.file.name);
  else if (files.length > 1) parts.push(`${files.length} files`);
  parts.push(...links.map((link) => `#${link.label}`));
  return parts.filter(Boolean).join(" · ");
}

/**
 * The channel's messages that did not send, between the thread and the
 * composer. Retry sends the very same message again (same files, same
 * idempotency key); Discard drops it.
 */
export function ChatUnsentDrafts({ channel, onSent }: Props) {
  const channelKey = chatChannelKey(channel);
  const items = useUnsentDrafts(channelKey);
  const sendMessage = useSendChatMessage();
  const onScreenRef = useRef(channelKey);
  onScreenRef.current = channelKey;

  if (items.length === 0) return null;

  const retry = async (item: UnsentDraft) => {
    if (!unsentDrafts.begin(item.id)) return;
    try {
      await sendMessage(item.channel, item.submit);
      unsentDrafts.remove(item.id);
      if (onScreenRef.current === chatChannelKey(item.channel)) onSent?.();
    } catch (cause) {
      unsentDrafts.fail(item.id, sendFailureReason(cause));
    }
  };

  return (
    <ul className="chat-unsent" aria-label="Messages not sent">
      {items.map((item) => (
        <li key={item.id} className="chat-unsent-item" role="alert">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-danger">Not sent · {item.error}</p>
            <p className="truncate text-base text-ink">{previewOf(item)}</p>
          </div>
          <div className="chat-unsent-actions flex flex-none gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={item.sending}
              onClick={() => void retry(item)}
            >
              {item.sending ? "Sending…" : "Retry"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={item.sending}
              onClick={() => unsentDrafts.remove(item.id)}
            >
              Discard
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
