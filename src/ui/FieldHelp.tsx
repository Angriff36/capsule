import { useId, useRef } from "react";
import { FieldHelpDetailsPanel } from "./field-help/FieldHelpDetailsPanel";
import { useFieldHelpCoordinator } from "./field-help/useFieldHelpCoordinator";
import { InfoIcon } from "./icons";
import { FIELD_HELP, type FieldHelpTerm } from "./fieldHelpTerms";

/** Small domain-help icon that remains safe to use inside form labels. */
export function FieldHelp({ term }: { term: FieldHelpTerm }) {
  const entry = FIELD_HELP[term];
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const learnMoreRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const help = useFieldHelpCoordinator({ rootRef, triggerRef, learnMoreRef });

  return (
    <span
      ref={rootRef}
      className="field-help"
      onMouseEnter={help.onMouseEnter}
      onMouseLeave={help.onMouseLeave}
      onBlur={(event) => {
        if (
          !help.detailsOpen &&
          !rootRef.current?.contains(event.relatedTarget as Node | null)
        ) {
          help.closeTooltip();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && help.open && !help.detailsOpen) {
          event.stopPropagation();
          help.closeTooltip();
        }
      }}
    >
      <span
        role="button"
        tabIndex={0}
        ref={triggerRef}
        className="field-help-trigger"
        aria-label={`About ${entry.title.toLowerCase()}`}
        aria-expanded={help.open}
        aria-controls={help.open ? panelId : undefined}
        onFocus={help.onTriggerFocus}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          help.toggle();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            help.toggle();
          }
        }}
      >
        <InfoIcon width={13} height={13} />
      </span>
      {help.open || help.detailsOpen ? (
        <span id={panelId} role="note" className="field-help-panel">
          <span className="field-help-title">{entry.title}</span>
          <span className="block">{entry.body}</span>
          <span className="block text-ink-3">
            <span className="font-semibold text-ink-2">Example: </span>
            {entry.example}
          </span>
          <span
            ref={learnMoreRef}
            role="button"
            tabIndex={0}
            className="field-help-link"
            aria-haspopup="dialog"
            onPointerDown={(event) => event.preventDefault()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              help.openDetails();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                help.openDetails();
              }
            }}
          >
            Learn more
          </span>
        </span>
      ) : null}
      <FieldHelpDetailsPanel
        term={term}
        open={help.detailsOpen}
        portalContainer={help.portalContainer}
        onClose={help.closeDetails}
      />
    </span>
  );
}
