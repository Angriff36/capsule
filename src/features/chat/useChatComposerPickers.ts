import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { CHAT_RECORD_MIN_TERM } from "./ChatRecordPicker";
import {
  chatPersonMatches,
  chatSpliceText,
  chatTriggerAtCaret,
} from "./chatComposerCaret";
import { CHAT_LINK_KINDS, type ChatLinkKind } from "./chatLinkTokens";
import type { ChatLinkTarget } from "./chatTypes";

const SEARCH_DEBOUNCE_MS = 180;

export type ChatPickerPersonInput = {
  readonly personId: string;
  readonly name: string;
};
export type ChatPickerLinkOutput = {
  readonly kind: ChatLinkKind;
  readonly id: string;
  readonly label: string;
};

type Params = {
  readonly text: string;
  readonly caret: number;
  /** True while focus is inside the composer; caret pickers hide otherwise. */
  readonly focusWithin: boolean;
  readonly people: readonly ChatPickerPersonInput[];
  readonly searchRecords: (term: string) => Promise<readonly ChatLinkTarget[]>;
  /** Replace the textarea text; the composer restores the caret. */
  readonly onReplaceText: (value: string, caret: number) => void;
  readonly onAddMention: (person: ChatPickerPersonInput) => void;
  readonly onAddLink: (link: ChatPickerLinkOutput) => void;
  readonly focusTextarea: () => void;
};

/** Last completed record search; `results` null = never resolved for `term`. */
type RecordSearch = {
  readonly term: string;
  readonly results: readonly ChatLinkTarget[] | null;
};

function isChatLinkKind(kind: string): kind is ChatLinkKind {
  return (CHAT_LINK_KINDS as readonly string[]).includes(kind);
}

/**
 * The composer's `@` and `#` pickers: which one the caret (or the toolbar
 * button) has opened, the debounced record search, the highlighted option,
 * and the keyboard that drives them.
 */
export function useChatComposerPickers({
  text,
  caret,
  focusWithin,
  people,
  searchRecords,
  onReplaceText,
  onAddMention,
  onAddLink,
  focusTextarea,
}: Params) {
  const pickerId = useId();
  const searchRef = useRef(searchRecords);
  searchRef.current = searchRecords;

  /** Trigger start the user dismissed with Esc; stays closed until it moves. */
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [toolbarTerm, setToolbarTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState<RecordSearch>({
    term: "",
    results: null,
  });

  const trigger = useMemo(() => chatTriggerAtCaret(text, caret), [text, caret]);
  const caretTrigger =
    trigger !== null &&
    trigger.start !== dismissedAt &&
    focusWithin &&
    !toolbarOpen
      ? trigger
      : null;
  const peopleMatches = useMemo(
    () =>
      caretTrigger?.char === "@"
        ? people.filter((person) =>
            chatPersonMatches(person.name, caretTrigger.fragment),
          )
        : [],
    [caretTrigger, people],
  );
  // A bare `@` stays plain text so Enter still sends; the picker needs letters.
  const peopleOpen =
    caretTrigger?.char === "@" &&
    caretTrigger.fragment.length > 0 &&
    peopleMatches.length > 0;
  const recordTerm = toolbarOpen
    ? toolbarTerm.trim()
    : caretTrigger?.char === "#"
      ? caretTrigger.fragment.trim()
      : "";
  const recordOpen =
    toolbarOpen ||
    (caretTrigger?.char === "#" && recordTerm.length >= CHAT_RECORD_MIN_TERM);
  const searchPending =
    recordTerm.length >= CHAT_RECORD_MIN_TERM &&
    (search.term !== recordTerm || search.results === null);
  const recordResults = searchPending
    ? undefined
    : recordTerm.length >= CHAT_RECORD_MIN_TERM
      ? (search.results ?? [])
      : [];
  const pickerOpen = peopleOpen || recordOpen;
  const pickerCount = peopleOpen
    ? peopleMatches.length
    : recordOpen
      ? (recordResults?.length ?? 0)
      : 0;
  const active = pickerCount > 0 ? Math.min(activeIndex, pickerCount - 1) : 0;

  // Debounced record search; a superseded response is dropped.
  useEffect(() => {
    if (!recordOpen || recordTerm.length < CHAT_RECORD_MIN_TERM) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchRef.current(recordTerm).then(
        (found) => {
          if (!cancelled) setSearch({ term: recordTerm, results: found });
        },
        () => {
          if (!cancelled) setSearch({ term: recordTerm, results: [] });
        },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [recordOpen, recordTerm]);

  // A new option list starts at the top.
  const caretFragment = caretTrigger?.fragment;
  useEffect(() => {
    setActiveIndex(0);
  }, [recordTerm, caretFragment, peopleOpen, recordOpen]);

  // Esc dismissal ends with the trigger it dismissed.
  useEffect(() => {
    if (trigger === null) setDismissedAt(null);
  }, [trigger]);

  const closeToolbar = () => {
    setToolbarOpen(false);
    setToolbarTerm("");
  };

  const toggleToolbar = () => {
    if (toolbarOpen) {
      closeToolbar();
      focusTextarea();
    } else {
      setToolbarOpen(true);
      setToolbarTerm("");
    }
  };

  const closePicker = () => {
    if (toolbarOpen) {
      closeToolbar();
      focusTextarea();
    } else if (trigger !== null) {
      setDismissedAt(trigger.start);
    }
  };

  const replaceTrigger = (insert: string) => {
    if (caretTrigger === null) return;
    let start = caretTrigger.start;
    // Removing a `#fragment` also takes the space before it when the text
    // after the caret already starts with one (or ends), so the join reads
    // "check for with" — not "check for  with".
    if (
      insert === "" &&
      start > 0 &&
      /\s/.test(text[start - 1] ?? "") &&
      (caretTrigger.end >= text.length ||
        /\s/.test(text[caretTrigger.end] ?? ""))
    ) {
      start -= 1;
    }
    const next = chatSpliceText(text, start, caretTrigger.end, insert);
    onReplaceText(next.value, next.caret);
  };

  const pickPerson = (person: ChatPickerPersonInput) => {
    replaceTrigger(`@${person.name} `);
    onAddMention(person);
    focusTextarea();
  };

  const pickRecord = (target: ChatLinkTarget) => {
    if (!isChatLinkKind(target.kind)) return;
    onAddLink({ kind: target.kind, id: target.id, label: target.label });
    if (toolbarOpen) closeToolbar();
    else replaceTrigger("");
    focusTextarea();
  };

  const pickActive = () => {
    if (peopleOpen) {
      const person = peopleMatches[active];
      if (person) pickPerson(person);
    } else if (recordOpen && recordResults) {
      const target = recordResults[active];
      if (target) pickRecord(target);
    }
  };

  /** Arrow / Enter / Tab / Esc while a picker is open. True when handled. */
  const handlePickerKey = (event: KeyboardEvent<HTMLElement>): boolean => {
    if (!pickerOpen) return false;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      // Nothing to highlight yet: let the caret move.
      if (pickerCount === 0) return false;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : pickerCount - 1;
      setActiveIndex((active + step) % pickerCount);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
      return true;
    }
    if (pickerCount > 0 && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      pickActive();
      return true;
    }
    if (event.key === "Enter" && recordOpen && recordResults === undefined) {
      // Still searching — do not send a half-typed #fragment.
      event.preventDefault();
      return true;
    }
    return false;
  };

  return {
    pickerId,
    pickerOpen,
    pickerCount,
    active,
    setActiveIndex,
    peopleOpen,
    peopleMatches,
    recordOpen,
    recordTerm,
    recordResults,
    toolbarOpen,
    toolbarTerm,
    setToolbarTerm,
    toggleToolbar,
    closeToolbar,
    pickPerson,
    pickRecord,
    handlePickerKey,
    /** Forget an Esc dismissal — after a send clears the text. */
    resetDismissal: () => setDismissedAt(null),
  };
}
