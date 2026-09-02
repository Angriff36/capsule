import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMobileViewport } from "../../app/shell/useMobileViewport";
import { formatDate } from "../../lib/format";
import { EmptyState, TableSkeleton } from "../../ui/primitives";
import { ChatComposer, type ChatComposerSubmit } from "../chat/ChatComposer";
import { ChatUnsentDrafts } from "../chat/ChatUnsentDrafts";
import {
  ChatConversationRail,
  type ChatRailTeammate,
} from "../chat/ChatConversationRail";
import { ChatThread } from "../chat/ChatThread";
import {
  CHAT_RETENTION_MS,
  CHAT_UNLINKED_REASON,
  type ChatChannel,
  chatChannelKey,
} from "../chat/chatTypes";
import { useChannelReadMarker } from "../chat/useChannelReadMarker";
import { sendFailureReason, unsentDrafts } from "../chat/useUnsentDrafts";
import {
  useChatChannel,
  useChatChannelSummary,
  useChatConversations,
  useChatIdentity,
  useChatMessageActions,
  useChatRecordSearch,
  useMarkDirectRead,
  useSendChatMessage,
} from "../chat/useTeamChat";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import "../chat/chat.css";

/** Messages older than this drop out of the UI — 90-day retention window. */
export const MESSAGE_RETENTION_MS = CHAT_RETENTION_MS;

/**
 * Team chat: event channels and direct messages in one place. `?event=<id>`
 * or `?dm=<personId>` selects the thread so notifications can deep-link.
 */
export function MessagesPage() {
  const identity = useChatIdentity();
  const mobile = useMobileViewport();
  const [searchParams, setSearchParams] = useSearchParams();
  const dmParam = searchParams.get("dm");
  const eventParam = searchParams.get("event");
  const channel = useMemo<ChatChannel | null>(
    () =>
      eventParam
        ? { kind: "event", eventId: eventParam }
        : dmParam
          ? { kind: "direct", personId: dmParam }
          : null,
    [dmParam, eventParam],
  );
  const channelKey = channel ? chatChannelKey(channel) : "";

  const conversations = useChatConversations();
  const thread = useChatChannel(channel);
  // The channel's own facts (cursor id, read position) — the rail may not
  // list this event, and a cursor must never be opened twice.
  const summary = useChatChannelSummary(
    channel?.kind === "event" ? channel.eventId : null,
  );
  const actions = useChatMessageActions();
  const sendMessage = useSendChatMessage();
  const searchRecords = useChatRecordSearch();
  const markDirectRead = useMarkDirectRead();
  const onReachBottom = useChannelReadMarker(
    channel?.kind === "event" ? channelKey : null,
    summary,
  );
  const [sending, setSending] = useState(false);
  const [pinSignal, setPinSignal] = useState(0);
  const [focusSignal, setFocusSignal] = useState(0);

  const select = useCallback(
    (next: ChatChannel | null) => {
      const params = new URLSearchParams(searchParams);
      params.delete("dm");
      params.delete("event");
      if (next?.kind === "event") params.set("event", next.eventId);
      if (next?.kind === "direct") params.set("dm", next.personId);
      setSearchParams(params);
      if (next && !mobile) setFocusSignal((n) => n + 1);
    },
    [mobile, searchParams, setSearchParams],
  );

  const events = conversations?.events ?? [];
  const teammates = useMemo<ChatRailTeammate[]>(() => {
    const byPerson = new Map(
      (conversations?.direct ?? []).map((row) => [row.personId, row]),
    );
    return identity.roster
      .filter((person) => person._id !== identity.personId)
      .map((person) => {
        const id = String(person._id);
        const conversation = byPerson.get(id);
        return {
          personId: id,
          name: identity.names.get(id) ?? "Teammate",
          unread: conversation?.unread ?? 0,
          lastAt: conversation?.lastAt ?? 0,
          preview: conversation?.preview ?? "",
        };
      })
      .sort((a, b) => b.lastAt - a.lastAt || a.name.localeCompare(b.name));
  }, [conversations, identity]);

  const selectedTeammate =
    channel?.kind === "direct"
      ? teammates.find((row) => row.personId === channel.personId)
      : undefined;
  const selectedEvent =
    channel?.kind === "event"
      ? events.find((row) => row.eventId === channel.eventId)
      : undefined;
  const totalUnread =
    teammates.reduce((sum, row) => sum + row.unread, 0) +
    events.reduce((sum, row) => sum + row.unread, 0);

  const messages =
    thread === undefined ? undefined : thread === null ? [] : thread.messages;

  // Opening a direct thread clears its unread markers (recipient-only command).
  useEffect(() => {
    if (channel?.kind === "direct" && messages) {
      markDirectRead(messages, identity.personId);
    }
  }, [channel, identity.personId, markDirectRead, messages]);

  // A send finishes on the channel it left from. If the user has moved on,
  // its pin must not land on the channel now on screen; a failure becomes
  // that channel's "Not sent" row, shown when they come back.
  const channelRef = useRef(channelKey);
  channelRef.current = channelKey;

  const onSubmit = async (submit: ChatComposerSubmit) => {
    if (!channel) return;
    const sentFrom = channel;
    setSending(true);
    try {
      await sendMessage(sentFrom, submit);
      if (channelRef.current === chatChannelKey(sentFrom)) {
        setPinSignal((n) => n + 1);
      }
    } catch (cause) {
      unsentDrafts.keep(sentFrom, submit, sendFailureReason(cause));
    } finally {
      setSending(false);
    }
  };

  const people = useMemo(
    () => teammates.map(({ personId, name }) => ({ personId, name })),
    [teammates],
  );

  const showRail = !mobile || channel == null;
  const showThread = !mobile || channel != null;
  const headerTitle =
    channel?.kind === "event"
      ? (selectedEvent?.title ?? "Event channel")
      : channel?.kind === "direct"
        ? (selectedTeammate?.name ?? "Former teammate")
        : "";
  const headerMeta =
    channel?.kind === "event" && selectedEvent?.startsAt
      ? formatDate(selectedEvent.startsAt)
      : null;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Team chat</p>
          <h1 className="display-title mt-2">Team chat</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Event channels and direct messages for your team. Share photos,
            files, and links to events and dishes. Threads stay available for 90
            days.
          </p>
        </div>
        <div className="rounded-sm border border-brand/20 bg-brand-soft px-5 py-4 text-center">
          <p className="text-3xl leading-none font-semibold text-brand">
            {totalUnread}
          </p>
          <p className="mt-1 text-xs font-medium tracking-wide text-ink-2 uppercase">
            Unread
          </p>
        </div>
      </header>
      <WorkforceWorkspaceNav />

      {identity.loading || conversations === undefined ? (
        <TableSkeleton rows={4} />
      ) : (
        <section
          className="working-ledger grid md:grid-cols-[260px_1fr]"
          data-testid="staff-messages"
        >
          {showRail ? (
            <ChatConversationRail
              events={events}
              teammates={teammates}
              channel={channel}
              onSelect={select}
            />
          ) : null}

          {showThread ? (
            channel == null ? (
              <div className="m-4">
                <EmptyState
                  title="Pick a channel or a teammate"
                  hint="Event channels keep the whole crew on one page; direct messages stay between the two of you."
                />
              </div>
            ) : thread === null ? (
              <div className="m-4">
                <EmptyState
                  title="This conversation isn't available"
                  hint={
                    identity.personId
                      ? "The event or teammate may have been removed."
                      : CHAT_UNLINKED_REASON
                  }
                />
              </div>
            ) : (
              <div className="chat-shell">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-4 py-3">
                  <div className="min-w-0">
                    {mobile ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm mb-2"
                        onClick={() => select(null)}
                      >
                        ← All chats
                      </button>
                    ) : null}
                    <p className="truncate text-lg font-semibold text-ink">
                      {headerTitle}
                    </p>
                    {headerMeta ? (
                      <p className="font-mono text-xs text-ink-3">
                        {headerMeta}
                      </p>
                    ) : null}
                  </div>
                  {channel.kind === "event" ? (
                    <Link
                      className="text-link inline-flex"
                      to={`/events/${channel.eventId}?tab=chat`}
                    >
                      Open event
                    </Link>
                  ) : null}
                </div>
                <ChatThread
                  messages={messages}
                  myPersonId={identity.personId}
                  personNames={identity.names}
                  channelKey={channelKey}
                  canManage={identity.canManage}
                  pinSignal={pinSignal}
                  onEdit={actions.edit}
                  onRemove={actions.remove}
                  onReachBottom={onReachBottom}
                  emptyTitle={
                    channel.kind === "event"
                      ? "No messages yet"
                      : "No messages in the last 90 days"
                  }
                  emptyHint={
                    channel.kind === "event"
                      ? "Start the crew conversation for this event."
                      : "Say hello."
                  }
                />
                <ChatUnsentDrafts
                  channel={channel}
                  onSent={() => setPinSignal((n) => n + 1)}
                />
                <ChatComposer
                  key={channelKey}
                  placeholder={
                    channel.kind === "event"
                      ? `Message the “${headerTitle}” crew…`
                      : `Message ${headerTitle}…`
                  }
                  disabledReason={
                    identity.personId ? null : CHAT_UNLINKED_REASON
                  }
                  people={people}
                  searchRecords={searchRecords}
                  onSubmit={onSubmit}
                  sending={sending}
                  focusSignal={focusSignal}
                />
              </div>
            )
          ) : null}
        </section>
      )}
    </div>
  );
}
