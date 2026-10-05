import { useState } from "react";
import { useStaffSuggestions } from "../../lib/workforceScheduling";

type Suggestion = {
  personId: string;
  name: string;
  prefersRole: boolean;
  agency: string | null;
  hoursBooked: number;
};
type Exclusion = { personId: string; name: string; reason: string };

/** Suggested people for one open shift, and why the rest are left out. */
export function StaffNeedSuggestionList({
  suggested,
  excluded,
  onPick,
  disabled,
}: {
  suggested: readonly Suggestion[];
  excluded: readonly Exclusion[];
  onPick: (personId: string) => void;
  disabled: boolean;
}) {
  return (
    <div
      className="mt-2 space-y-2 border-t border-line pt-2 text-sm"
      data-testid="staff-need-suggestions"
    >
      {suggested.length === 0 ? (
        <p className="text-ink-3">Nobody suitable is free for this shift.</p>
      ) : (
        <ul className="space-y-1">
          {suggested.map((row) => (
            <li key={row.personId} className="flex items-center gap-2">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={disabled}
                onClick={() => onPick(row.personId)}
              >
                Pick
              </button>
              <span className="font-medium text-ink">{row.name}</span>
              <span className="text-ink-3">
                {[
                  row.prefersRole ? "prefers this role" : null,
                  row.agency ? `agency: ${row.agency}` : null,
                  `${Math.round(row.hoursBooked)} h already booked`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {excluded.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-ink-2">
            Left out ({excluded.length})
          </summary>
          <ul className="mt-1 space-y-0.5 text-ink-2">
            {excluded.map((row) => (
              <li key={row.personId}>
                <span className="font-medium text-ink">{row.name}</span>
                {" - "}
                {row.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/** "Suggest people" toggle; loads suggestions only when opened. */
export function StaffNeedSuggestions({
  needId,
  onPick,
  disabled,
}: {
  needId: string;
  onPick: (personId: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const result = useStaffSuggestions(open ? needId : null);
  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide suggestions" : "Suggest people"}
      </button>
      {open ? (
        result === undefined ? (
          <p className="mt-2 text-sm text-ink-3" role="status">
            Checking who is free…
          </p>
        ) : (
          <StaffNeedSuggestionList
            suggested={result.suggested}
            excluded={result.excluded}
            disabled={disabled}
            onPick={(personId) => {
              onPick(personId);
              setOpen(false);
            }}
          />
        )
      ) : null}
    </div>
  );
}
