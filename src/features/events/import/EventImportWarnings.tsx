type Props = {
  warnings: readonly string[];
  /** The subset that means data was left out or guessed. */
  decisions: readonly string[];
};

/**
 * What the reports could not settle. Nothing here blocks the import — the
 * anomalies also become review flags on the event — but a person should know
 * before clicking Create what was skipped, assumed, or disputed between reports.
 */
export function EventImportWarnings({ warnings, decisions }: Props) {
  if (warnings.length === 0) return null;
  const decided = new Set(decisions);
  const notes = warnings.filter((warning) => !decided.has(warning));
  return (
    <section
      className="card border-warning/40 bg-warning-soft/40 space-y-2 px-4 py-3"
      data-testid="event-import-warnings"
    >
      <p className="text-sm font-semibold text-ink">
        {warnings.length} thing{warnings.length === 1 ? "" : "s"} to check
        {decisions.length > 0
          ? ` — ${decisions.length} left something out or assumed a value`
          : ""}
      </p>
      {decisions.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
          {decisions.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      {notes.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          {notes.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-ink-3">
        Report disagreements and off-headcount servings are raised as review
        flags on the event so they are settled there, not lost here.
      </p>
    </section>
  );
}
