import type { ProposalCarryoverPreview } from "./ProposalEventPrefill";

/**
 * The structured "will carry over" list on the create-event Proposal aside.
 * Presentational only — the prefill class computes every row; a row without a
 * value shows honestly that nothing carries, never a fake value.
 */
export function ProposalEventCarryoverPreview({
  preview,
}: {
  readonly preview: ProposalCarryoverPreview;
}) {
  return (
    <div data-testid="proposal-carryover-preview">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-3">
        Will carry over
      </p>
      <dl className="space-y-1.5">
        {preview.rows.map((row) => (
          <div key={row.key} data-testid={`proposal-carryover-${row.key}`}>
            <dt className="text-xs text-ink-3">{row.label}</dt>
            <dd
              className={`text-sm ${row.willCarry ? "text-ink" : "text-ink-3"}`}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      <p
        data-testid="proposal-carryover-link-reason"
        role="status"
        className="pt-1 text-xs leading-relaxed text-ink-3"
      >
        {preview.linkReason}
      </p>
    </div>
  );
}
