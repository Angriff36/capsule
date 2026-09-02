import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EmptyState, Skeleton } from "../../ui/primitives";
import { ChatMessageItem, formatChatTime } from "./ChatMessageItem";
import type { ChatMessageView } from "./chatTypes";
import { useChatAppearance } from "./useChatAppearance";
import "./chat.css";

/** Consecutive messages from one sender inside this window share a header. */
const HEADER_GAP_MS = 5 * 60_000;
/** Bubbles: a centered time stamp separates runs this far apart. */
const STAMP_GAP_MS = 60 * 60_000;
/** This close to the bottom counts as "at the bottom". */
const PIN_THRESHOLD_PX = 80;
const REACH_BOTTOM_DEBOUNCE_MS = 2_000;

export type ChatThreadProps = {
  /** undefined = loading */
  readonly messages: readonly ChatMessageView[] | undefined;
  readonly myPersonId: string | null;
  /** personId -> display name; unknown ids render "Former teammate". */
  readonly personNames: ReadonlyMap<string, string>;
  /** Changes when the channel changes; the thread resets and jumps to the bottom. */
  readonly channelKey: string;
  /** manageAccess: may remove anyone's message. */
  readonly canManage: boolean;
  /** Event channels name the sender; a direct message needs no names. */
  readonly showSenderNames: boolean;
  /** Increment after the caller's own send to force a pin-to-bottom. */
  readonly pinSignal: number;
  readonly onEdit: (message: ChatMessageView, body: string) => Promise<void>;
  readonly onRemove: (message: ChatMessageView) => Promise<void>;
  /**
   * Fires (debounced, at most once per 2s) when the user is at the bottom and
   * the newest message is visible — the caller marks the channel read up to
   * `newestAt`, the send time of that newest visible message.
   */
  readonly onReachBottom?: (newestAt: number | null) => void;
  readonly emptyTitle: string;
  readonly emptyHint: string;
};

function newestOf(sorted: readonly ChatMessageView[]): {
  id: string;
  at: number;
} {
  const last = sorted[sorted.length - 1];
  return last ? { id: last._id, at: last.createdAt } : { id: "", at: 0 };
}

function ChatThreadSkeleton() {
  return (
    <div
      className="space-y-5 px-4 py-4"
      role="status"
      aria-label="Loading messages"
    >
      {[0, 1, 2].map((row) => (
        <div key={row} className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * The scrolling message list. Stays pinned to the newest message while the
 * reader is at the bottom; otherwise new arrivals raise a "New messages" pill.
 */
export function ChatThread({
  messages,
  myPersonId,
  personNames,
  channelKey,
  canManage,
  showSenderNames,
  pinSignal,
  onEdit,
  onRemove,
  onReachBottom,
  emptyTitle,
  emptyHint,
}: ChatThreadProps) {
  const { layout } = useChatAppearance();
  const listRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  /** Newest message at the last effect ("" / 0 for an empty list); null while loading. */
  const newestRef = useRef<{ id: string; at: number } | null>(null);
  const [showNewPill, setShowNewPill] = useState(false);

  const reachRef = useRef(onReachBottom);
  reachRef.current = onReachBottom;
  /** Newest visible send time, read at call time so a debounced call is current. */
  const newestAtRef = useRef<number | null>(null);
  const lastReachRef = useRef(0);
  const reachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyReachBottom = useCallback(() => {
    if (!reachRef.current) return;
    const wait = REACH_BOTTOM_DEBOUNCE_MS - (Date.now() - lastReachRef.current);
    if (wait <= 0) {
      lastReachRef.current = Date.now();
      reachRef.current(newestAtRef.current);
      return;
    }
    if (reachTimerRef.current !== null) return;
    reachTimerRef.current = setTimeout(() => {
      reachTimerRef.current = null;
      // The reader may have scrolled up while the timer waited; rows that
      // arrived since are not visible and must stay unread.
      if (!pinnedRef.current) return;
      lastReachRef.current = Date.now();
      reachRef.current?.(newestAtRef.current);
    }, wait);
  }, []);

  useEffect(
    () => () => {
      if (reachTimerRef.current !== null) clearTimeout(reachTimerRef.current);
    },
    [],
  );

  const jumpToBottom = useCallback(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const pinToBottom = useCallback(() => {
    pinnedRef.current = true;
    setShowNewPill(false);
    jumpToBottom();
  }, [jumpToBottom]);

  const sorted = useMemo(
    () =>
      messages === undefined
        ? undefined
        : [...messages].sort((a, b) => a.createdAt - b.createdAt),
    [messages],
  );
  newestAtRef.current =
    sorted && sorted.length > 0
      ? (sorted[sorted.length - 1]?.createdAt ?? null)
      : null;

  // Channel switch or the caller's own send: reset and pin to the bottom.
  // `sorted` is read here, not watched — the effect below owns its changes.
  useLayoutEffect(() => {
    newestRef.current = sorted === undefined ? null : newestOf(sorted);
    pinToBottom();
    if (sorted !== undefined && sorted.length > 0) notifyReachBottom();
  }, [channelKey, pinSignal, pinToBottom, notifyReachBottom]);

  // Messages arrive: follow them while pinned, otherwise offer the pill. An
  // arrival is a NEWER newest message — not a longer list, because a thread
  // capped at the seam's maximum keeps its length while it rolls forward,
  // and not a shorter one, because removing the newest row is not news.
  useLayoutEffect(() => {
    if (sorted === undefined) {
      newestRef.current = null;
      return;
    }
    const previous = newestRef.current;
    const current = newestOf(sorted);
    newestRef.current = current;
    if (previous === null) {
      pinToBottom();
      if (sorted.length > 0) notifyReachBottom();
      return;
    }
    const arrived =
      current.at > previous.at ||
      (current.at === previous.at && current.id !== previous.id);
    if (!arrived || current.id === "") return;
    if (pinnedRef.current) {
      jumpToBottom();
      notifyReachBottom();
    } else {
      setShowNewPill(true);
    }
  }, [sorted, pinToBottom, jumpToBottom, notifyReachBottom]);

  // Late image loads, textarea growth and rotation all change the geometry;
  // keep the bottom in view while pinned.
  useEffect(() => {
    const list = listRef.current;
    const inner = innerRef.current;
    if (!list || !inner || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (pinnedRef.current) jumpToBottom();
    });
    observer.observe(list);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [jumpToBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight < PIN_THRESHOLD_PX;
    if (atBottom && !pinnedRef.current) {
      setShowNewPill(false);
      notifyReachBottom();
    }
    pinnedRef.current = atBottom;
  };

  const onImageLoad = () => {
    if (pinnedRef.current) jumpToBottom();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={listRef} className="chat-thread" onScroll={onScroll}>
        <div
          ref={innerRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
        >
          {sorted === undefined ? (
            <ChatThreadSkeleton />
          ) : sorted.length === 0 ? (
            <EmptyState title={emptyTitle} hint={emptyHint} />
          ) : (
            <ul className="chat-list">
              {sorted.map((message, index) => {
                const previous = index > 0 ? sorted[index - 1] : undefined;
                const next = sorted[index + 1];
                const startsGroup =
                  previous === undefined ||
                  previous.senderPersonId !== message.senderPersonId ||
                  message.createdAt - previous.createdAt > HEADER_GAP_MS;
                const endsGroup =
                  next === undefined ||
                  next.senderPersonId !== message.senderPersonId ||
                  next.createdAt - message.createdAt > HEADER_GAP_MS;
                const groupPosition =
                  startsGroup && endsGroup
                    ? "only"
                    : startsGroup
                      ? "first"
                      : endsGroup
                        ? "last"
                        : "middle";
                const mine =
                  myPersonId !== null && message.senderPersonId === myPersonId;
                // Bubbles carry no time on every row; a centered stamp marks a
                // new hour-long gap or a new day instead.
                const stamp =
                  layout === "bubbles" &&
                  (previous === undefined ||
                    message.createdAt - previous.createdAt > STAMP_GAP_MS ||
                    new Date(message.createdAt).toDateString() !==
                      new Date(previous.createdAt).toDateString());
                return (
                  <Fragment key={message._id}>
                    {stamp ? (
                      <li className="chat-stamp" aria-hidden="true">
                        <time
                          dateTime={new Date(message.createdAt).toISOString()}
                        >
                          {formatChatTime(message.createdAt)}
                        </time>
                      </li>
                    ) : null}
                    <ChatMessageItem
                      message={message}
                      senderName={
                        mine
                          ? "You"
                          : (personNames.get(message.senderPersonId) ??
                            "Former teammate")
                      }
                      mine={mine}
                      showHeader={startsGroup}
                      layout={layout}
                      groupPosition={groupPosition}
                      showSenderName={showSenderNames && !mine}
                      canEdit={mine}
                      canRemove={mine || canManage}
                      onEdit={(body) => onEdit(message, body)}
                      onRemove={() => onRemove(message)}
                      onImageLoad={onImageLoad}
                    />
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {showNewPill ? (
        <button
          type="button"
          className="btn btn-primary btn-sm absolute bottom-3 left-1/2 -translate-x-1/2"
          onClick={() => {
            pinToBottom();
            notifyReachBottom();
          }}
        >
          New messages ↓
        </button>
      ) : null}
    </div>
  );
}
