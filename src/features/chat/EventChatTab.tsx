import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../../ui/primitives";
import { EventTabPanel } from "../events/EventTabPanel";
import { ChatComposer, type ChatComposerSubmit } from "./ChatComposer";
import { ChatThread } from "./ChatThread";
import { ChatUnsentDrafts } from "./ChatUnsentDrafts";
import {
  CHAT_UNLINKED_REASON,
  type ChatChannel,
  chatChannelKey,
} from "./chatTypes";
import { useChannelReadMarker } from "./useChannelReadMarker";
import {
  useChatChannel,
  useChatChannelSummary,
  useChatIdentity,
  useChatMessageActions,
  useChatRecordSearch,
  useSendChatMessage,
} from "./useTeamChat";
import { sendFailureReason, unsentDrafts } from "./useUnsentDrafts";
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
  const onReachBottom = useChannelReadMarker(channelKey, summary);
  const [sending, setSending] = useState(false);
  const [pinSignal, setPinSignal] = useState(0);

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

  // A send finishes on the channel it left from (the tab is reused when the
  // route moves to another event): its pin never lands elsewhere, and a
  // failure becomes that channel's "Not sent" row, wherever the user is now.
  const channelRef = useRef(channelKey);
  channelRef.current = channelKey;

  const onSubmit = async (submit: ChatComposerSubmit) => {
    const sentFrom = channel;
    // Bound to whoever is signed in NOW: the server commits only for this
    // identity, and a failed draft belongs to it alone.
    const sentBy = identity.sender;
    if (!sentBy) return;
    setSending(true);
    try {
      await sendMessage(sentFrom, submit, sentBy);
      if (channelRef.current === chatChannelKey(sentFrom)) {
        setPinSignal((n) => n + 1);
      }
    } catch (cause) {
      unsentDrafts.keep(sentBy, sentFrom, submit, sendFailureReason(cause));
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
          <ChatUnsentDrafts
            channel={channel}
            identity={identity.identityKey}
            onSent={() => setPinSignal((n) => n + 1)}
          />
          <ChatComposer
            key={channelKey}
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
          />
        </div>
      )}
    </EventTabPanel>
  );
}
