import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "./icons";
import "./ui-layouts.css";

export type MultiSelectOption = { value: string; label: string };

/**
 * Pick several values from a list, adapted from ui-layouts "Multi Selector"
 * (MIT, see ui-layouts.LICENSE.txt). It replaces the native <select multiple>
 * box that needs Ctrl+click. The choices show as chips; the list opens with a
 * search box, Select all and Clear. With `name` it posts one hidden input per
 * choice, so a <form> reading FormData.getAll(name) keeps working.
 */
export function MultiSelect({
  options,
  value,
  defaultValue = [],
  onChange,
  name,
  label,
  placeholder = "Choose…",
  maxChips = 3,
  disabled,
}: {
  options: readonly MultiSelectOption[];
  value?: readonly string[];
  defaultValue?: readonly string[];
  onChange?: (value: string[]) => void;
  name?: string;
  /** Accessible name of the control when no <label> wraps it. */
  label?: string;
  placeholder?: string;
  maxChips?: number;
  disabled?: boolean;
}) {
  const [own, setOwn] = useState<readonly string[]>(defaultValue);
  const selected = value ?? own;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const set = (next: string[]) => {
    if (value === undefined) setOwn(next);
    onChange?.(next);
  };
  const toggle = (entry: string) =>
    set(
      selected.includes(entry)
        ? selected.filter((item) => item !== entry)
        : [...selected, entry],
    );

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? options.filter((option) => option.label.toLowerCase().includes(needle))
      : options;
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        rootRef.current?.contains(event.target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const labelOf = (entry: string) =>
    options.find((option) => option.value === entry)?.label ?? entry;
  const allChosen = options.length > 0 && selected.length === options.length;

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={rootRef}
        className="multi-select"
        data-open={open || undefined}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {name
          ? selected.map((entry) => (
              <input key={entry} type="hidden" name={name} value={entry} />
            ))
          : null}
        <button
          type="button"
          className="multi-select-trigger input"
          aria-label={label}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
        >
          {selected.length === 0 ? (
            <span className="multi-select-placeholder">{placeholder}</span>
          ) : (
            <span className="multi-select-chips">
              {selected.slice(0, maxChips).map((entry) => (
                <span key={entry} className="multi-select-chip">
                  {labelOf(entry)}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${labelOf(entry)}`}
                    className="multi-select-chip-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle(entry);
                    }}
                  >
                    <XIcon width={11} height={11} />
                  </span>
                </span>
              ))}
              {selected.length > maxChips ? (
                <span className="multi-select-chip multi-select-more">
                  +{selected.length - maxChips} more
                </span>
              ) : null}
            </span>
          )}
          <ChevronDownIcon
            className="multi-select-chevron"
            width={13}
            height={13}
          />
        </button>
        <AnimatePresence>
          {open ? (
            <motion.div
              className="multi-select-panel"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
            >
              <input
                className="input multi-select-search"
                placeholder="Search…"
                aria-label="Search the list"
                value={query}
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
              />
              <ul id={listId} role="listbox" aria-multiselectable="true">
                {query === "" && options.length > 1 ? (
                  <li>
                    <button
                      type="button"
                      role="option"
                      aria-selected={allChosen}
                      className="multi-select-option"
                      onClick={() =>
                        set(
                          allChosen
                            ? []
                            : options.map((option) => option.value),
                        )
                      }
                    >
                      <span className="multi-select-box">
                        {allChosen ? (
                          <CheckIcon width={11} height={11} />
                        ) : null}
                      </span>
                      Select all
                    </button>
                  </li>
                ) : null}
                {shown.map((option) => {
                  const on = selected.includes(option.value);
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={on}
                        className="multi-select-option"
                        onClick={() => toggle(option.value)}
                      >
                        <span className="multi-select-box">
                          {on ? <CheckIcon width={11} height={11} /> : null}
                        </span>
                        {option.label}
                      </button>
                    </li>
                  );
                })}
                {shown.length === 0 ? (
                  <li className="multi-select-empty">Nothing matches.</li>
                ) : null}
              </ul>
              <div className="multi-select-foot">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={selected.length === 0}
                  onClick={() => set([])}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setOpen(false)}
                >
                  Done
                </button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
