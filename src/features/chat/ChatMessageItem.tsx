import { Fragment, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { ChatAttachmentList } from "./ChatAttachmentList";
import { chatKindIcon } from "./chatIcons";
import {
  CHAT_LINK_KIND_LABELS,
  chatLinkPath,
  parseChatBody,
  type ChatLinkKind,
} from "./chatLinkTokens";
import type { ChatMessageView } from "./chatTypes";
import { useChatTextareaGrow } from "./useChatTextareaGrow";
import { useCoarsePointer } from "./useCoarsePointer";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatChatTime(ms: number): string {
  return timeFormat.format(new Date(ms));
}

export type ChatMessageItemProps = {
  readonly message: ChatMessageView;
  readonly senderName: string;
  readonly mine: boolean;
  readonly showHeader: boolean;
  /** mine */
  readonly canEdit: boolean;
  /** mine || canManage */
  readonly canRemove: boolean;
  readonly onEdit: (body: string) => Promise<void>;
  readonly onRemove: () => Promise<void>;
  readonly onImageLoad?: () => void;
};

type Mode = "view" | "edit" | "confirm";

function errorText(cause: unknown): string {
  return cause instanceof Error && cause.message
    ? cause.message
    : "Something went wrong. Try again.";
}

function ChatRecordLink({
  kind,
  id,
  label,
}: {
  kind: ChatLinkKind;
  id: string;
  label: string;
}) {
  const Icon = chatKindIcon(kind);
  return (
    <Link
      to={chatLinkPath(kind, id)}
      className="inline-flex items-center gap-1 align-baseline font-medium text-brand hover:underline"
    >
      <Icon width={14} height={14} />
      {label || CHAT_LINK_KIND_LABELS[kind]}
    </Link>
  );
}

/** Text runs plus inline record links, in order. */
function ChatBody({ body }: { body: string }) {
  return (
    <>
      {parseChatBody(body).map((part, index) =>
        part.type === "text" ? (
          <Fragment key={index}>{part.text}</Fragment>
        ) : (
          <ChatRecordLink
            key={index}
            kind={part.kind}
            id={part.id}
            label={part.label}
          />
        ),
      )}
    </>
  );
}

/** One ruled message row. Own messages read "You" on an inset surface. */
export function ChatMessageItem({
  message,
  senderName,
  mine,
  showHeader,
  canEdit,
  canRemove,
  onEdit,
  onRemove,
  onImageLoad,
}: ChatMessageItemProps) {
  const coarse = useCoarsePointer();
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useChatTextareaGrow(editRef, mode === "edit" ? draft : null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setMode("view");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setMode("view");
    setError(null);
  };

  const save = () => {
    const body = draft.trim();
    if (!body) return;
    if (body === message.body) {
      cancel();
      return;
    }
    void run(() => onEdit(body));
  };

  const onDraftKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !coarse &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      save();
    }
  };

  const time = formatChatTime(message.createdAt);
  const hasBody = message.body.trim().length > 0;
  const isRead =
    mine && message.recipientPersonId !== null && message.readAt !== null;
  const meta: string[] = [];
  if (message.editedAt !== null) meta.push("Edited");
  if (isRead) meta.push("Read");
  const showActions = mode === "view" && (canEdit || canRemove);
  const showTools = !showHeader || showActions;

  return (
    <li
      className={`group chat-row flex gap-2 px-4 ${showHeader ? "pt-2.5 pb-1.5" : "py-1"} ${mine ? "bg-inset" : ""}`}
      data-message-id={message._id}
    >
      <div className="min-w-0 flex-1">
        {showHeader ? (
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-semibold text-ink">
              {senderName}
            </span>
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              className="font-mono text-xs text-ink-3"
            >
              {time}
            </time>
          </div>
        ) : null}

        {mode === "edit" ? (
          <div className="mt-1 space-y-2">
            <textarea
              ref={editRef}
              className="input chat-textarea text-base"
              rows={1}
              aria-label="Edit message"
              value={draft}
              autoFocus
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy || !draft.trim()}
                onClick={save}
              >
                {busy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={cancel}
              >
                Cancel
              </button>
              <span className="text-xs text-ink-3">
                {coarse ? "Esc to cancel" : "Enter to save · Esc to cancel"}
              </span>
            </div>
          </div>
        ) : (
          <>
            {hasBody ? (
              <p className="text-base leading-relaxed break-words whitespace-pre-wrap text-ink">
                <ChatBody body={message.body} />
              </p>
            ) : null}
            <ChatAttachmentList
              attachments={message.attachments}
              onImageLoad={onImageLoad}
            />
            {meta.length > 0 ? (
              <p className="mt-0.5 text-xs text-ink-3">{meta.join(" · ")}</p>
            ) : null}
          </>
        )}

        {mode === "confirm" ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-base text-ink-2">
            <span>Remove this message?</span>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() => void run(onRemove)}
            >
              {busy ? "Removing…" : "Confirm"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={cancel}
            >
              Cancel
            </button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="mt-1 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {/* In the flow beside the body (never over it): the row reserves the
          cluster's width, and h-0 keeps the h-8 buttons from adding height. */}
      {showTools ? (
        <div className="chat-row-tools -mt-1 flex h-0 shrink-0 items-center gap-1.5 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
          {!showHeader ? (
            <time
              dateTime={new Date(message.createdAt).toISOString()}
              className="chat-row-time px-1 font-mono text-xs text-ink-3"
            >
              {time}
            </time>
          ) : null}
          {showActions && canEdit ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setDraft(message.body);
                setError(null);
                setMode("edit");
              }}
            >
              Edit
            </button>
          ) : null}
          {showActions && canRemove ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={() => {
                setError(null);
                setMode("confirm");
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
