import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../ui/primitives";
import { EventTabPanel } from "../events/EventTabPanel";
import { ChatComposer, type ChatComposerSubmit } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import {
  CHAT_UNLINKED_REASON,
  type ChatChannel,
  chatChannelKey,
} from "./chatTypes";
import {
  useChatChannel,
  useChatChannelSummary,
  useChatIdentity,
  useChatMessageActions,
  useChatReadCursor,
  useChatRecordSearch,
  useSendChatMessage,
} from "./useTeamChat";
import "./chat.css";

type Props = {
  readonly eventId: string;
  readonly eventTitle: string;
};

/**
 * The event's channel, as a tab on the event dossier. Every staff role can
 * read and post; the same channel appears under Event channels on
 * /staff/messages. Lives in chat/ because event features may not construct
 * Convex hooks directly.
 */
export function EventChatTab({ eventId, eventTitle }: Props) {
  const identity = useChatIdentity();
  const channel = useMemo<ChatChannel>(
    () => ({ kind: "event", eventId }),
    [eventId],
  );
  const channelKey = chatChannelKey(channel);
  const thread = useChatChannel(channel);
  const summary = useChatChannelSummary(eventId);
  const actions = useChatMessageActions();
  const sendMessage = useSendChatMessage();
  const searchRecords = useChatRecordSearch();
  const moveCursor = useChatReadCursor();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinSignal, setPinSignal] = useState(0);
  // A cursor opened this session, before the summary query catches up.
  const openedCursorId = useRef<string | null>(null);
  // The thread reached the bottom before the summary loaded; replay it once.
  const pendingReach = useRef(false);

  const people = useMemo(
    () =>
      identity.roster
        .filter((person) => person._id !== identity.personId)
        .map((person) => ({
          personId: String(person._id),
          name: identity.names.get(String(person._id)) ?? "Teammate",
        })),
    [identity],
  );

  const onReachBottom = useCallback(() => {
    if (summary === undefined) {
      pendingReach.current = true;
      return;
    }
    if (summary === null) return;
    const cursorId = summary.myCursorId ?? openedCursorId.current;
    if (cursorId && summary.unread === 0) return;
    void moveCursor(channelKey, cursorId).then((id) => {
      if (id) openedCursorId.current = id;
    });
  }, [channelKey, moveCursor, summary]);

  useEffect(() => {
    if (summary && pendingReach.current) {
      pendingReach.current = false;
      onReachBottom();
    }
  }, [summary, onReachBottom]);

  const onSubmit = async (submit: ChatComposerSubmit) => {
    setError(null);
    setSending(true);
    try {
      const { warning } = await sendMessage(channel, submit);
      setPinSignal((n) => n + 1);
      if (warning) setError(warning);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The message was not sent.",
      );
      throw cause;
    } finally {
      setSending(false);
    }
  };

  const countLabel =
    summary && summary.count > 0
      ? `${summary.count}${summary.countCapped ? "+" : ""} ${
          summary.count === 1 && !summary.countCapped ? "message" : "messages"
        }`
      : null;

  return (
    <EventTabPanel
      eyebrow="Team chat"
      title="Team chat"
      description={`Crew conversation for “${eventTitle}”. Share photos, files, and links to dishes or other events.`}
      testId="event-chat-tab"
      actions={
        <>
          {countLabel ? (
            <span className="chip-meta font-mono text-xs">{countLabel}</span>
          ) : null}
          <Link
            className="text-link inline-flex"
            to={`/staff/messages?event=${encodeURIComponent(eventId)}`}
          >
            All chats
          </Link>
        </>
      }
    >
      {thread === null ? (
        <EmptyState
          title="This event's chat isn't available"
          hint="The event may have been removed, or it isn't part of your workspace."
        />
      ) : (
        <div className="chat-shell">
          <ChatThread
            messages={thread?.messages}
            myPersonId={identity.personId}
            personNames={identity.names}
            channelKey={channelKey}
            canManage={identity.canManage}
            pinSignal={pinSignal}
            onEdit={actions.edit}
            onRemove={actions.remove}
            onReachBottom={onReachBottom}
            emptyTitle="No messages yet"
            emptyHint="Start the crew conversation for this event."
          />
          <ChatComposer
            placeholder={`Message the “${eventTitle}” crew…`}
            disabledReason={
              identity.loading || identity.personId
                ? null
                : CHAT_UNLINKED_REASON
            }
            people={people}
            searchRecords={searchRecords}
            onSubmit={onSubmit}
            sending={sending}
            error={error}
          />
        </div>
      )}
    </EventTabPanel>
  );
}
