import { RecordPreviewSheet } from "../RecordPreviewSheet";
import { FIELD_HELP, type FieldHelpTerm } from "../fieldHelpTerms";
import { FIELD_HELP_CASCADE, FIELD_HELP_STAGE } from "./fieldHelpCascade";

export function FieldHelpDetailsPanel({
  term,
  open,
  portalContainer,
  onClose,
}: {
  term: FieldHelpTerm;
  open: boolean;
  portalContainer: HTMLElement | null;
  onClose: () => void;
}) {
  const entry = FIELD_HELP[term];
  const stage = FIELD_HELP_STAGE[term];
  return (
    <RecordPreviewSheet
      open={open}
      label="How this fits"
      title={entry.title}
      description="Follow the event-to-purchase cascade to see where this concept belongs."
      closeLabel={`Close ${entry.title} help`}
      portalContainer={portalContainer}
      onClose={onClose}
    >
      <div className="grid gap-5 text-sm text-ink-2">
        <div className="border-b border-line pb-4">
          <p className="font-semibold text-ink">{entry.body}</p>
          <p className="mt-2">
            <span className="font-semibold text-ink">Example: </span>
            {entry.example}
          </p>
          <a
            href={entry.link.href}
            className="field-help-link mt-3 inline-flex"
          >
            {entry.link.label}
          </a>
        </div>
        <ol className="grid gap-2" aria-label="Event to purchase cascade">
          {FIELD_HELP_CASCADE.map((step, index) => {
            const current = step.id === stage;
            return (
              <li
                key={step.id}
                className={`grid grid-cols-[2rem_1fr] gap-3 border-l-2 py-2 pl-3 ${
                  current ? "border-brand bg-accent-soft" : "border-line"
                }`}
              >
                <span className="font-mono text-xs font-semibold text-ink-3">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="font-semibold text-ink">{step.title}</p>
                  <p>{step.description}</p>
                  {current ? (
                    <p className="mt-1 font-semibold text-brand">
                      This term is here.
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </RecordPreviewSheet>
  );
}
