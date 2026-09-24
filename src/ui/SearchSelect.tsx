import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

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
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** Hidden form field so FormData / draft persistence see the choice. */
  name?: string;
  /** `form` attribute for the hidden field when the control lives outside its form. */
  form?: string;
  required?: boolean;
  disabled?: boolean;
  emptyText?: string;
  "aria-label"?: string;
  /** Test id prefix for the combobox input. */
  testId?: string;
  maxVisible?: number;
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Searchable single-select for long reference lists (clients, venues, people).
 * Type to filter, arrow keys to move, Enter to choose, Escape to close. The
 * chosen option's hint stays visible so look-alike records (two "Singh
 * Campsite"s) are told apart before the form is submitted.
 */
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  name,
  form,
  required = false,
  disabled = false,
  emptyText = "No matches.",
  "aria-label": ariaLabel,
  testId,
  maxVisible = 40,
}: Props) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);
  // The draft saver only hears native input events. A React value update on
  // the hidden field does not emit one, so a client or venue choice was lost
  // once the search keystrokes had already been saved (#368 item 4).
  const announceChoice = useRef(false);

  useEffect(() => {
    if (!announceChoice.current) return;
    announceChoice.current = false;
    hiddenRef.current?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [value]);

  const selected = useMemo(
    () => options.find((option) => option.id === value),
    [options, value],
  );

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return options;
    const words = needle.split(/\s+/).filter(Boolean);
    return options.filter((option) => {
      const haystack = normalize(
        `${option.label} ${option.hint ?? ""} ${option.keywords ?? ""}`,
      );
      return words.every((word) => haystack.includes(word));
    });
  }, [options, query]);
  const visible = filtered.slice(0, maxVisible);
  const hiddenCount = filtered.length - visible.length;

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

  const choose = (id: string) => {
    announceChoice.current = true;
    onChange(id);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      if (!open) return;
      event.preventDefault();
      const option = visible[activeIndex];
      if (option) choose(option.id);
    } else if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
    } else if (event.key === "Backspace" && query === "" && value) {
      announceChoice.current = true;
      onChange("");
    }
  };

  const inputValue = open ? query : (selected?.label ?? "");

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
          open && visible[activeIndex]
            ? `${listId}-${visible[activeIndex].id}`
            : undefined
        }
        className="input"
        placeholder={selected ? selected.label : placeholder}
        value={inputValue}
        disabled={disabled}
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
          {visible.map((option, index) => {
            const isSelected = option.id === value;
            const isActive = index === activeIndex;
            return (
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
              </li>
            );
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
