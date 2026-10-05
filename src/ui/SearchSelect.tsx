import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  pinRecents,
  rankBySearch,
  readRecents,
  rememberRecent,
} from "./pickerSearch";

export type SearchSelectOption = {
  id: string;
  label: string;
  /** Quiet disambiguating facts (address, email, capacity) shown under the label. */
  hint?: string | null;
  /** Extra words the filter should also match (email, city, asset tag…). */
  keywords?: string | null;
};

type Props = {
  options: readonly SearchSelectOption[];
  /** Controlled value. Omit it (and use `defaultValue`) for plain FormData forms. */
  value?: string;
  defaultValue?: string;
  onChange?: (id: string) => void;
  /**
   * Remembers this browser's last five picks under this key and pins them
   * at the top of the list (e.g. "client", "dish", "vendor", "staff").
   */
  recentsKey?: string;
  placeholder?: string;
  /** Hidden form field so FormData / draft persistence see the choice. */
  name?: string;
  /** `form` attribute for the hidden field when the control lives outside its form. */
  form?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  emptyText?: string;
  "aria-label"?: string;
  /** Test id prefix for the combobox input. */
  testId?: string;
  maxVisible?: number;
  /** Starts an external, portal-backed create flow for the current no-match query. */
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
};

/**
 * Searchable single-select for long reference lists (clients, venues, people).
 * Type to filter, arrow keys to move, Enter to choose, Escape to close. The
 * chosen option's hint stays visible so look-alike records (two "Singh
 * Campsite"s) are told apart before the form is submitted.
 */
export function SearchSelect({
  options,
  value: controlledValue,
  defaultValue = "",
  onChange,
  recentsKey,
  placeholder = "Type to search…",
  name,
  form,
  required = false,
  disabled = false,
  autoFocus = false,
  emptyText = "No matches.",
  "aria-label": ariaLabel,
  testId,
  maxVisible = 40,
  onCreate,
  createLabel = (query) => `Create “${query}”`,
}: Props) {
  const listId = useId();
  const [internalValue, setInternalValue] = useState(defaultValue);
  const value = controlledValue ?? internalValue;
  const [recentIds, setRecentIds] = useState(() => readRecents(recentsKey));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  // The draft saver listens on the form. These pickers sit outside that form
  // and are tied to it only by the form attribute, so a bubbling event on the
  // hidden field never reaches the saver (#368 item 4).
  const announceChoice = useRef(false);

  useEffect(() => {
    if (!announceChoice.current) return;
    announceChoice.current = false;
    const field = hiddenRef.current;
    const owner = field?.form ?? field;
    owner?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [value]);

  const selected = useMemo(
    () => options.find((option) => option.id === value),
    [options, value],
  );

  const { recent, ranked } = useMemo(() => {
    if (query.trim()) {
      return {
        recent: [] as SearchSelectOption[],
        ranked: rankBySearch(options, query, (option) => ({
          label: option.label,
          extra: `${option.hint ?? ""} ${option.keywords ?? ""}`,
        })),
      };
    }
    const pinned = pinRecents(options, recentIds, (option) => option.id);
    return { recent: pinned.recent, ranked: pinned.rest };
  }, [options, query, recentIds]);
  const visible = [...recent, ...ranked.slice(0, maxVisible)];
  const hiddenCount = ranked.length - (visible.length - recent.length);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  // Uncontrolled pickers follow their form's reset like a native select.
  useEffect(() => {
    if (controlledValue !== undefined) return;
    const owner = hiddenRef.current?.form;
    if (!owner) return;
    const onReset = () => setInternalValue(defaultValue);
    owner.addEventListener("reset", onReset);
    return () => owner.removeEventListener("reset", onReset);
  }, [controlledValue, defaultValue]);

  const commit = (id: string) => {
    announceChoice.current = true;
    if (controlledValue === undefined) setInternalValue(id);
    onChange?.(id);
  };

  const choose = (id: string) => {
    commit(id);
    if (options.some((option) => option.id === id)) {
      setRecentIds(rememberRecent(recentsKey, id));
    }
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const itemCount = visible.length + (canCreate ? 1 : 0);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) =>
        Math.min(index + 1, Math.max(itemCount - 1, 0)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      event.stopPropagation();
      if (canCreate && activeIndex === visible.length) {
        const typed = query.trim();
        setOpen(false);
        onCreate?.(typed);
        return;
      }
      const option = visible[activeIndex];
      if (option) choose(option.id);
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
    } else if (event.key === "Backspace" && query === "" && value) {
      commit("");
    }
  };

  const inputValue = open ? query : (selected?.label ?? "");
  const canCreate =
    !!onCreate && query.trim().length > 0 && visible.length === 0;

  return (
    <div ref={rootRef} className="relative">
      {name ? (
        <input
          ref={hiddenRef}
          type="hidden"
          name={name}
          value={value}
          form={form}
          readOnly
          data-testid={testId ? `${testId}-value` : undefined}
        />
      ) : null}
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-activedescendant={
          open
            ? canCreate && activeIndex === visible.length
              ? `${listId}-create`
              : visible[activeIndex]
                ? `${listId}-${visible[activeIndex].id}`
                : undefined
            : undefined
        }
        className="input"
        placeholder={selected ? selected.label : placeholder}
        value={inputValue}
        disabled={disabled}
        autoFocus={autoFocus}
        required={required && !value}
        autoComplete="off"
        data-testid={testId}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {selected?.hint && !open ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-3">
          {selected.hint}
        </p>
      ) : null}
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xs border border-line bg-panel p-1 shadow-sm"
        >
          {visible.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-ink-3">{emptyText}</li>
          ) : null}
          {canCreate ? (
            <li
              id={`${listId}-create`}
              role="option"
              aria-selected={activeIndex === visible.length}
              className={`mt-1 cursor-pointer border-t border-line px-2 py-1.5 text-sm font-semibold text-brand ${
                activeIndex === visible.length
                  ? "bg-accent-soft"
                  : "hover:bg-accent-soft"
              }`}
              onMouseEnter={() => setActiveIndex(visible.length)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const typed = query.trim();
                setOpen(false);
                onCreate?.(typed);
              }}
            >
              + {createLabel(query.trim())}
            </li>
          ) : null}
          {visible.map((option, index) => {
            const header =
              recent.length && index === 0
                ? "Recent"
                : recent.length && index === recent.length
                  ? "All"
                  : null;
            const isSelected = option.id === value;
            const isActive = index === activeIndex;
            return [
              header ? (
                <li
                  key={`header-${header}`}
                  role="presentation"
                  className="px-2 pt-1.5 pb-0.5 text-xs font-medium tracking-wide text-ink-3 uppercase"
                >
                  {header}
                </li>
              ) : null,
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={isSelected}
                className={`cursor-pointer rounded-xs px-2 py-1.5 text-sm ${
                  isActive
                    ? "bg-accent-soft"
                    : isSelected
                      ? "bg-inset"
                      : "hover:bg-inset"
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  choose(option.id);
                }}
              >
                <span className="block truncate font-medium text-ink">
                  {option.label}
                </span>
                {option.hint ? (
                  <span className="block truncate text-xs text-ink-3">
                    {option.hint}
                  </span>
                ) : null}
              </li>,
            ];
          })}
          {hiddenCount > 0 ? (
            <li className="px-2 py-1.5 text-xs text-ink-3">
              {hiddenCount} more — keep typing to narrow the list.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
