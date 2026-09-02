import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { chatKindIcon } from "./chatIcons";
import { keepOptionInView } from "./chatPickerScroll";
import type { ChatLinkTarget } from "./chatTypes";

export const CHAT_RECORD_MIN_TERM = 2;

export type ChatRecordPickerProps = {
  /** Picker id (the `aria-controls` target, present in every state); option ids are `${id}-${index}`. */
  readonly id: string;
  readonly term: string;
  /** undefined while a search is pending. */
  readonly results: readonly ChatLinkTarget[] | undefined;
  readonly activeIndex: number;
  readonly onActiveIndexChange: (index: number) => void;
  readonly onPick: (target: ChatLinkTarget) => void;
  /** Rendered above the list — the toolbar variant's own search input. */
  readonly header?: ReactNode;
};

/** Keep the textarea (or search input) focused while the mouse picks. */
const keepFocus = (event: MouseEvent<HTMLButtonElement>) =>
  event.preventDefault();

/** The `#` menu: records matching the search term. Controlled by the composer. */
export function ChatRecordPicker({
  id,
  term,
  results,
  activeIndex,
  onActiveIndexChange,
  onPick,
  header,
}: ChatRecordPickerProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    keepOptionInView(pickerRef.current, `${id}-${activeIndex}`);
  }, [id, activeIndex, results]);

  let body: ReactNode;
  if (term.length < CHAT_RECORD_MIN_TERM) {
    body = (
      <p className="chat-picker-note">
        Type at least {CHAT_RECORD_MIN_TERM} characters to search
      </p>
    );
  } else if (results === undefined) {
    body = (
      <p className="chat-picker-note" role="status">
        Searching…
      </p>
    );
  } else if (results.length === 0) {
    body = <p className="chat-picker-note">No matching records</p>;
  } else {
    body = (
      <div role="listbox" aria-label="Records">
        {results.map((target, index) => {
          const Icon = chatKindIcon(target.kind);
          return (
            <button
              key={`${target.kind}:${target.id}`}
              type="button"
              role="option"
              id={`${id}-${index}`}
              aria-selected={index === activeIndex}
              onMouseDown={keepFocus}
              onMouseEnter={() => onActiveIndexChange(index)}
              onClick={() => onPick(target)}
            >
              <Icon width={14} height={14} className="text-ink-3" />
              <span className="min-w-0 truncate">{target.label}</span>
              {target.hint ? (
                <span className="ml-auto shrink-0 text-xs text-ink-3">
                  {target.hint}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={pickerRef} id={id} className="chat-picker">
      {header ? <div className="chat-picker-head">{header}</div> : null}
      {body}
    </div>
  );
}
