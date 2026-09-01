import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import {
  ChatFileChips,
  ChatLinkedRow,
  type ChatPendingFile,
} from "./ChatComposerChips";
import { ChatPeoplePicker } from "./ChatPeoplePicker";
import { ChatRecordPicker } from "./ChatRecordPicker";
import { LinkIcon, PaperclipIcon } from "./chatIcons";
import { chatLinkToken, type ChatLinkKind } from "./chatLinkTokens";
import type { ChatLinkTarget } from "./chatTypes";
import {
  restoreDraftFiles,
  restoreDraftLinks,
  restoreDraftMentions,
  restoreDraftText,
  type ChatComposerDraft,
} from "./chatComposerDraft";
import { useChatComposerPickers } from "./useChatComposerPickers";
import { useChatDropzone } from "./useChatDropzone";
import { useChatTextareaGrow } from "./useChatTextareaGrow";
import { useCoarsePointer } from "./useCoarsePointer";
import "./chat.css";

export type ChatComposerLink = {
  readonly kind: ChatLinkKind;
  readonly id: string;
  readonly label: string;
};
export type ChatComposerPerson = {
  readonly personId: string;
  readonly name: string;
};
export type ChatComposerSubmit = {
  /** Trimmed text followed by one `[[kind:id|Label]]` token per linked record (space separated). Empty string allowed when files exist. */
  readonly body: string;
  readonly files: readonly File[];
  readonly mentionedPersonIds: readonly string[];
};
export type ChatComposerProps = {
  readonly placeholder: string;
  /** When set, the composer is disabled and shows this line instead of the toolbar (e.g. "Link your account to a staff profile before sending messages"). */
  readonly disabledReason?: string | null;
  /** Teammates for the @ picker (already excludes the current user). */
  readonly people: readonly ChatComposerPerson[];
  /** Record search for the # picker; resolves to [] on error. Called only with terms of ≥ 2 chars, debounced 180ms by the composer. */
  readonly searchRecords: (term: string) => Promise<readonly ChatLinkTarget[]>;
  readonly onSubmit: (submit: ChatComposerSubmit) => Promise<void>;
  readonly sending: boolean;
  /** Upload/send error from the caller; render as `role="alert"` text-sm text-danger above the toolbar. */
  readonly error: string | null;
  /** Optional: increments when the caller wants the textarea focused (e.g. after channel switch on desktop). */
  readonly focusSignal?: number;
};

/**
 * Message input: text with `@` mentions and `#` record links, pending files,
 * and one Send. Presentational — the caller owns upload and send.
 */
export function ChatComposer({
  placeholder,
  disabledReason = null,
  people,
  searchRecords,
  onSubmit,
  sending,
  error,
  focusSignal,
}: ChatComposerProps) {
  const coarse = useCoarsePointer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const nextFileKeyRef = useRef(0);

  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [files, setFiles] = useState<readonly ChatPendingFile[]>([]);
  const [links, setLinks] = useState<readonly ChatComposerLink[]>([]);
  const [mentions, setMentions] = useState<readonly ChatComposerPerson[]>([]);
  const [focusWithin, setFocusWithin] = useState(false);

  const focusTextarea = () => textareaRef.current?.focus();

  const pickers = useChatComposerPickers({
    text,
    caret,
    focusWithin,
    people,
    searchRecords,
    focusTextarea,
    onReplaceText: (value, nextCaret) => {
      pendingCaretRef.current = nextCaret;
      setText(value);
      setCaret(nextCaret);
    },
    onAddMention: (person) =>
      setMentions((prev) =>
        prev.some((mention) => mention.personId === person.personId)
          ? prev
          : [...prev, person],
      ),
    onAddLink: (link) =>
      setLinks((prev) =>
        prev.some((item) => item.kind === link.kind && item.id === link.id)
          ? prev
          : [...prev, link],
      ),
  });

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const added = Array.from(incoming, (file) => ({
      key: `f${nextFileKeyRef.current++}`,
      file,
    }));
    setFiles((prev) => [...prev, ...added]);
  };

  const { dragActive, dropHandlers } = useChatDropzone(addFiles);

  // Restore the caret after a programmatic edit.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const next = pendingCaretRef.current;
    if (next !== null) {
      el.setSelectionRange(next, next);
      pendingCaretRef.current = null;
    }
  }, [text]);
  useChatTextareaGrow(textareaRef, text);

  // Focus on request; the mount value only counts when it is already > 0.
  const firstFocusRef = useRef(true);
  useEffect(() => {
    if (focusSignal === undefined) return;
    if (firstFocusRef.current) {
      firstFocusRef.current = false;
      if (focusSignal <= 0) return;
    }
    textareaRef.current?.focus();
  }, [focusSignal]);

  const trimmed = text.trim();
  const canSend =
    !sending && (trimmed.length > 0 || files.length > 0 || links.length > 0);

  const submit = async () => {
    if (!canSend || submittingRef.current) return;
    submittingRef.current = true;
    const draft: ChatComposerDraft = { text, files, links, mentions };
    const body = [
      trimmed,
      ...links.map((link) => chatLinkToken(link.kind, link.id, link.label)),
    ]
      .filter(Boolean)
      .join(" ");
    // Clear right away so anything typed while the send is in flight is
    // kept as the next message instead of being wiped when it resolves.
    setText("");
    setCaret(0);
    setFiles([]);
    setLinks([]);
    setMentions([]);
    pickers.resetDismissal();
    try {
      await onSubmit({
        body,
        files: draft.files.map((pending) => pending.file),
        mentionedPersonIds: draft.mentions.map((mention) => mention.personId),
      });
    } catch {
      // The caller renders `error`; the failed draft goes back in front of
      // whatever was typed since so nothing is lost.
      setText((current) => restoreDraftText(draft.text, current));
      setFiles((current) => restoreDraftFiles(draft.files, current));
      setLinks((current) => restoreDraftLinks(draft.links, current));
      setMentions((current) => restoreDraftMentions(draft.mentions, current));
      return;
    } finally {
      submittingRef.current = false;
    }
    focusTextarea();
  };

  const onTextareaChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setText(event.target.value);
    setCaret(event.target.selectionStart);
  };

  const onTextareaKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (pickers.handlePickerKey(event)) return;
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !coarse &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (event.clipboardData.files.length === 0) return;
    event.preventDefault();
    addFiles(event.clipboardData.files);
  };

  const onBlur = (event: FocusEvent<HTMLFormElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setFocusWithin(false);
    if (pickers.toolbarOpen) pickers.closeToolbar();
  };

  if (disabledReason) {
    return (
      <div className="chat-composer">
        <p className="text-base text-ink-3">{disabledReason}</p>
      </div>
    );
  }

  const helper = coarse
    ? "@ to mention · # to link a record"
    : "Enter to send · Shift+Enter for a new line · @ to mention · # to link an event, dish, menu or client";

  return (
    <form
      className="chat-composer chat-dropzone"
      data-active={dragActive ? "true" : "false"}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onFocus={() => setFocusWithin(true)}
      onBlur={onBlur}
      {...dropHandlers}
    >
      <ChatLinkedRow
        links={links}
        mentions={mentions}
        onRemoveLink={(link) =>
          setLinks((prev) =>
            prev.filter(
              (item) => !(item.kind === link.kind && item.id === link.id),
            ),
          )
        }
        onRemoveMention={(personId) =>
          setMentions((prev) =>
            prev.filter((mention) => mention.personId !== personId),
          )
        }
      />
      <ChatFileChips
        files={files}
        onRemove={(key) =>
          setFiles((prev) => prev.filter((pending) => pending.key !== key))
        }
      />
      <div className="relative">
        {pickers.peopleOpen ? (
          <ChatPeoplePicker
            id={pickers.pickerId}
            people={pickers.peopleMatches}
            activeIndex={pickers.active}
            onActiveIndexChange={pickers.setActiveIndex}
            onPick={pickers.pickPerson}
          />
        ) : null}
        {pickers.recordOpen ? (
          <ChatRecordPicker
            id={pickers.pickerId}
            term={pickers.recordTerm}
            results={pickers.recordResults}
            activeIndex={pickers.active}
            onActiveIndexChange={pickers.setActiveIndex}
            onPick={pickers.pickRecord}
            header={
              pickers.toolbarOpen ? (
                <input
                  className="input text-base"
                  type="text"
                  aria-label="Search records"
                  placeholder="Search events, dishes, menus, clients…"
                  autoFocus
                  value={pickers.toolbarTerm}
                  onChange={(event) =>
                    pickers.setToolbarTerm(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (
                      !pickers.handlePickerKey(event) &&
                      event.key === "Enter"
                    ) {
                      event.preventDefault();
                    }
                  }}
                />
              ) : undefined
            }
          />
        ) : null}
        <textarea
          ref={textareaRef}
          className="input chat-textarea text-base"
          rows={1}
          aria-label="Message text"
          aria-autocomplete="list"
          aria-controls={pickers.pickerOpen ? pickers.pickerId : undefined}
          aria-activedescendant={
            pickers.pickerOpen && pickers.pickerCount > 0
              ? `${pickers.pickerId}-${pickers.active}`
              : undefined
          }
          placeholder={placeholder}
          value={text}
          onChange={onTextareaChange}
          onFocus={() => {
            // Back in the text: the toolbar picker must not eat Enter/arrows.
            if (pickers.toolbarOpen) pickers.closeToolbar();
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={onTextareaKeyDown}
          onPaste={onPaste}
        />
      </div>
      <p className="mt-1.5 text-xs text-ink-3">{helper}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <PaperclipIcon width={14} height={14} />
          Attach
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={pickers.toolbarOpen}
          aria-controls={pickers.toolbarOpen ? pickers.pickerId : undefined}
          onClick={pickers.toggleToolbar}
        >
          <LinkIcon width={14} height={14} />
          Link a record
        </button>
        <button
          type="submit"
          className="btn btn-primary ml-auto"
          disabled={!canSend}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
