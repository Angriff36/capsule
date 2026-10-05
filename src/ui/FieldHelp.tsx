import { useEffect, useId, useRef, useState } from "react";
import { InfoIcon } from "./icons";
import { FIELD_HELP, type FieldHelpTerm } from "./fieldHelpTerms";

/**
 * Small info icon beside a field label that explains a domain term and how it
 * feeds downstream math. Hover or focus previews it; click, Enter or Space
 * pins it open; Escape or an outside click closes it.
 *
 * The trigger is a `span role="button"` on purpose: most Capsule fields wrap
 * their input in a `<label>`, and a real `<button>` there would become the
 * label's control instead of the input.
 */
export function FieldHelp({ term }: { term: FieldHelpTerm }) {
  const entry = FIELD_HELP[term];
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setPinned(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setPinned(false);
  };
  const toggle = () => {
    const next = !pinned;
    setPinned(next);
    setOpen(next);
  };

  return (
    <span
      ref={rootRef}
      className="field-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null))
          close();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <span
        role="button"
        tabIndex={0}
        className="field-help-trigger"
        aria-label={`About ${entry.title.toLowerCase()}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onFocus={() => setOpen(true)}
        onClick={(event) => {
          // Keep a wrapping <label> from moving focus into its input.
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <InfoIcon width={13} height={13} />
      </span>
      {open ? (
        <span id={panelId} role="note" className="field-help-panel">
          <span className="field-help-title">{entry.title}</span>
          <span className="block">{entry.body}</span>
          <span className="block text-ink-3">
            <span className="font-semibold text-ink-2">Example: </span>
            {entry.example}
          </span>
          <a
            className="field-help-link"
            href={entry.link.href}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
          >
            {entry.link.label} ↗
          </a>
        </span>
      ) : null}
    </span>
  );
}
