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

export type {
  ChatComposerLink,
  ChatComposerPerson,
  ChatComposerProps,
  ChatComposerSubmit,
} from "./chatComposerTypes";
import type {
  ChatComposerLink,
  ChatComposerPerson,
  ChatComposerProps,
} from "./chatComposerTypes";

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
  initialDraft = null,
  onInitialDraftConsumed,
  restoreDraft = null,
  onRestoreConsumed,
  onDraftOrphaned,
}: ChatComposerProps) {
  const coarse = useCoarsePointer();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingCaretRef = useRef<number | null>(null);
  const submittingRef = useRef(false);
  const nextFileKeyRef = useRef(0);
  /** Idempotency key of a restored draft, reused by its next send attempt. */
  const draftKeyRef = useRef<string | null>(
    initialDraft?.idempotencyKey ?? null,
  );

  // Files from another composer instance are re-keyed against this
  // instance's counter so a newly attached file can never share a key.
  const rekey = (pending: readonly ChatPendingFile[]) =>
    pending.map((item) => ({ ...item, key: `f${nextFileKeyRef.current++}` }));
  // Layout effect: the flag flips during the unmount commit, before a
  // rejected send can resume and try to restore into a detached instance.
  // Armed in the setup too: StrictMode runs setup → cleanup → setup on mount.
  const mountedRef = useRef(true);
  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const [text, setText] = useState(initialDraft?.text ?? "");
  const [caret, setCaret] = useState(initialDraft?.text.length ?? 0);
  const [files, setFiles] = useState<readonly ChatPendingFile[]>(() =>
    rekey(initialDraft?.files ?? []),
  );
  const [links, setLinks] = useState<readonly ChatComposerLink[]>(
    initialDraft?.links ?? [],
  );
  const [mentions, setMentions] = useState<readonly ChatComposerPerson[]>(
    initialDraft?.mentions ?? [],
  );
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

  // The seed draft is now in this composer's state; the caller may drop its
  // copy. Mount only — the caller keeps it until a composer actually shows it.
  useEffect(() => {
    if (initialDraft) onInitialDraftConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A failed draft handed back while this composer is live: merge it in
  // front of whatever was typed since, once per token.
  const consumedRestoreRef = useRef<number | null>(null);
  useEffect(() => {
    if (!restoreDraft || consumedRestoreRef.current === restoreDraft.token) {
      return;
    }
    consumedRestoreRef.current = restoreDraft.token;
    const failed = restoreDraft.draft;
    if (failed.idempotencyKey) draftKeyRef.current = failed.idempotencyKey;
    setText((current) => restoreDraftText(failed.text, current));
    setFiles((current) => restoreDraftFiles(rekey(failed.files), current));
    setLinks((current) => restoreDraftLinks(failed.links, current));
    setMentions((current) => restoreDraftMentions(failed.mentions, current));
    onRestoreConsumed?.(restoreDraft.token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoreDraft, onRestoreConsumed]);

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
    // The same draft retried after a failure reuses its key, so a first
    // attempt that committed but lost its response is not sent twice.
    const idempotencyKey = draftKeyRef.current ?? crypto.randomUUID();
    draftKeyRef.current = null;
    const draft: ChatComposerDraft = {
      text,
      files,
      links,
      mentions,
      idempotencyKey,
    };
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
      // The caller renders `error`. If this composer is already gone (the
      // user switched channels), hand the draft to the caller; otherwise it
      // goes back in front of whatever was typed since so nothing is lost.
      if (!mountedRef.current) {
        onDraftOrphaned?.(draft);
        return;
      }
      draftKeyRef.current = draft.idempotencyKey ?? null;
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
