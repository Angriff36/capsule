import { formatDate } from "../../lib/format";
import type { ChatChannel, ChatEventConversation } from "./chatTypes";

export type ChatRailTeammate = {
  readonly personId: string;
  readonly name: string;
  readonly unread: number;
  readonly preview: string;
};

type RailEntryProps = {
  readonly active: boolean;
  readonly title: string;
  readonly meta?: string | null;
  readonly preview?: string;
  readonly unread: number;
  readonly unreadCapped?: boolean;
  readonly onClick: () => void;
};

function RailEntry({
  active,
  title,
  meta,
  preview,
  unread,
  unreadCapped = false,
  onClick,
}: RailEntryProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={`flex w-full cursor-pointer items-start justify-between gap-2 rounded-xs px-2 py-1.5 text-left transition-colors hover:bg-inset ${
        active ? "bg-inset" : ""
      }`}
    >
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-base text-ink ${
            active || unread > 0 ? "font-semibold" : ""
          }`}
        >
          {title}
        </span>
        {meta ? (
          <span className="block font-mono text-xs text-ink-3">{meta}</span>
        ) : null}
        {preview ? (
          <span className="block truncate text-xs text-ink-3">{preview}</span>
        ) : null}
      </span>
      {unread > 0 ? (
        <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand px-1 text-2xs leading-none font-semibold text-white">
          {unreadCapped ? `${unread}+` : unread}
        </span>
      ) : null}
    </button>
  );
}

type Props = {
  readonly events: readonly ChatEventConversation[];
  readonly teammates: readonly ChatRailTeammate[];
  readonly channel: ChatChannel | null;
  readonly onSelect: (channel: ChatChannel) => void;
};

/** The left rail of /staff/messages: event channels, then teammates. */
export function ChatConversationRail({
  events,
  teammates,
  channel,
  onSelect,
}: Props) {
  return (
    <aside className="chat-shell border-line-2 max-md:border-b md:border-r">
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        <p className="eyebrow px-4 pt-4" id="chat-rail-events">
          Event channels
        </p>
        {events.length === 0 ? (
          <p className="px-4 py-2 text-base text-ink-3">
            Upcoming events appear here. Open any event's Chat tab to start its
            channel.
          </p>
        ) : (
          <ul className="p-2" aria-labelledby="chat-rail-events">
            {events.map((row) => (
              <li key={row.eventId}>
                <RailEntry
                  active={
                    channel?.kind === "event" && channel.eventId === row.eventId
                  }
                  title={row.title}
                  meta={row.startsAt ? formatDate(row.startsAt) : null}
                  preview={row.preview}
                  unread={row.unread}
                  unreadCapped={row.unreadCapped}
                  onClick={() =>
                    onSelect({ kind: "event", eventId: row.eventId })
                  }
                />
              </li>
            ))}
          </ul>
        )}
        <p className="eyebrow px-4 pt-4" id="chat-rail-people">
          Teammates
        </p>
        {teammates.length === 0 ? (
          <p className="px-4 py-2 text-base text-ink-3">
            Teammates appear here once they are added to the roster.
          </p>
        ) : (
          <ul className="p-2" aria-labelledby="chat-rail-people">
            {teammates.map((row) => (
              <li key={row.personId}>
                <RailEntry
                  active={
                    channel?.kind === "direct" &&
                    channel.personId === row.personId
                  }
                  title={row.name}
                  preview={row.preview}
                  unread={row.unread}
                  onClick={() =>
                    onSelect({ kind: "direct", personId: row.personId })
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
