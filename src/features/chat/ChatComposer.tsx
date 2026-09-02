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
import { ChatComposerToolbar } from "./ChatComposerToolbar";
import { ChatPeoplePicker } from "./ChatPeoplePicker";
import { ChatRecordPicker } from "./ChatRecordPicker";
import { chatLinkToken } from "./chatLinkTokens";
import { CHAT_MAX_FILES } from "./chatTypes";
import { useChatComposerPickers } from "./useChatComposerPickers";
import { useChatDropzone } from "./useChatDropzone";
import { useChatTextareaGrow } from "./useChatTextareaGrow";
import { useCoarsePointer } from "./useCoarsePointer";
import "./chat.css";

export type {
  ChatComposerDraft,
  ChatComposerLink,
  ChatComposerPerson,
  ChatComposerProps,
  ChatComposerSubmit,
} from "./chatComposerTypes";
import type {
  ChatComposerDraft,
  ChatComposerLink,
  ChatComposerPerson,
  ChatComposerProps,
} from "./chatComposerTypes";

/**
 * Message input: text with `@` mentions and `#` record links, pending files,
 * and one Send. Presentational — the caller owns upload, send and whatever
 * did not send (ChatUnsentDrafts); the composer never takes a draft back.
 */
export function ChatComposer({
  placeholder,
  disabledReason = null,
  people,
  searchRecords,
  onSubmit,
  sending,
  focusSignal,
}: ChatComposerProps) {
  const coarse = useCoarsePointer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const [fileNote, setFileNote] = useState<string | null>(null);
  const fileCountRef = useRef(files.length);
  fileCountRef.current = files.length;
  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    // One message carries at most CHAT_MAX_FILES; the rest wait for the next.
    const room = Math.max(0, CHAT_MAX_FILES - fileCountRef.current);
    const kept = Array.from(incoming)
      .slice(0, room)
      .map((file) => ({ key: `f${nextFileKeyRef.current++}`, file }));
    const leftOff = incoming.length - kept.length;
    setFileNote(
      leftOff > 0
        ? `Up to ${CHAT_MAX_FILES} files per message — ${leftOff} left off. Send this message, then attach the rest.`
        : null,
    );
    if (kept.length > 0) setFiles((prev) => [...prev, ...kept]);
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
    // One key per draft; the caller keeps it with an unsent message so a
    // retry is the same server operation.
    const idempotencyKey = crypto.randomUUID();
    const draft: ChatComposerDraft = { text, files, links, mentions };
    const body = [
      trimmed,
      ...links.map((link) => chatLinkToken(link.kind, link.id, link.label)),
    ]
      .filter(Boolean)
      .join(" ");
    // Clear right away so anything typed while the send is in flight is
    // kept as the next message instead of being wiped when it resolves. A
    // failure does not come back here: the caller shows it as "Not sent".
    setText("");
    setCaret(0);
    setFiles([]);
    setLinks([]);
    setMentions([]);
    setFileNote(null);
    pickers.resetDismissal();
    try {
      await onSubmit({
        body,
        files: draft.files.map((pending) => pending.file),
        mentionedPersonIds: draft.mentions.map((mention) => mention.personId),
        draft,
        idempotencyKey,
      });
    } catch {
      // The caller has kept the unsent message; nothing to restore here.
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
      {fileNote ? (
        <p role="status" className="mt-2 text-sm text-warn">
          {fileNote}
        </p>
      ) : null}
      <ChatComposerToolbar
        onAttach={addFiles}
        toolbarOpen={pickers.toolbarOpen}
        pickerId={pickers.pickerId}
        onToggleToolbar={pickers.toggleToolbar}
        canSend={canSend}
        sending={sending}
      />
    </form>
  );
}
