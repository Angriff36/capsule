import {
  TIMELINE_ASSIGNEE_TEAMS,
  type TimelineAssigneeTeam,
} from "./timelineAssigneeOptions";
import type { TimelineStaffOption } from "./eventTimelineStaffRoster";

export type TimelineAssigneeSelection = {
  readonly teams: readonly TimelineAssigneeTeam[];
  readonly personIds: readonly string[];
};

type Props = {
  readonly selection: TimelineAssigneeSelection;
  readonly staffOptions: readonly TimelineStaffOption[];
  readonly disabled?: boolean;
  /** Already-formatted "who has this block", including any legacy
   *  responsibleParty fallback. Shown on the collapsed row. */
  readonly summaryLabel?: string;
  readonly onChange: (next: TimelineAssigneeSelection) => void;
};

/**
 * Multi-select for Everyone/FOH/BOH plus event-staffed people.
 *
 * Collapsed by default: a run sheet is 20+ blocks, and an open checkbox list on
 * every one of them buries the times and block names it is meant to annotate.
 * Native <details> so it stays keyboard- and screen-reader-operable for free.
 */
export function EventTimelineAssigneePicker({
  selection,
  staffOptions,
  disabled = false,
  summaryLabel,
  onChange,
}: Props) {
  const teamSet = new Set(selection.teams);
  const personSet = new Set(selection.personIds);

  const toggleTeam = (team: TimelineAssigneeTeam) => {
    const next = new Set(teamSet);
    if (next.has(team)) next.delete(team);
    else next.add(team);
    onChange({
      teams: TIMELINE_ASSIGNEE_TEAMS.filter((value) => next.has(value)),
      personIds: selection.personIds,
    });
  };

  const togglePerson = (personId: string) => {
    const next = new Set(personSet);
    if (next.has(personId)) next.delete(personId);
    else next.add(personId);
    onChange({
      teams: selection.teams,
      personIds: staffOptions
        .map((option) => option.personId)
        .filter((id) => next.has(id)),
    });
  };

  const chosen = summaryLabel?.trim()
    ? summaryLabel.split(", ").filter(Boolean)
    : [];
  const summary =
    chosen.length === 0
      ? "Anyone"
      : chosen.length <= 2
        ? chosen.join(", ")
        : `${chosen.slice(0, 2).join(", ")} +${chosen.length - 2}`;

  return (
    <details
      className="group rounded-sm border border-line-2 bg-canvas px-2.5 py-1.5"
      data-testid="timeline-assignee-picker"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm text-ink-2 marker:content-none">
        <span className="text-xs font-semibold tracking-[0.06em] text-ink-3 uppercase">
          Assigned to
        </span>
        <span className={chosen.length === 0 ? "text-ink-3" : "text-ink"}>
          {summary}
        </span>
        <span className="ml-auto text-xs text-ink-3 group-open:hidden">
          Edit
        </span>
        <span className="ml-auto hidden text-xs text-ink-3 group-open:inline">
          Done
        </span>
      </summary>
      <div className="mt-2 flex flex-wrap gap-3">
        {TIMELINE_ASSIGNEE_TEAMS.map((team) => (
          <label
            key={team}
            className="inline-flex items-center gap-1.5 text-sm text-ink"
          >
            <input
              type="checkbox"
              className="accent-brand"
              checked={teamSet.has(team)}
              disabled={disabled}
              onChange={() => toggleTeam(team)}
            />
            {team}
          </label>
        ))}
      </div>
      {staffOptions.length === 0 ? (
        <p className="mt-2 text-sm text-ink-3">
          No staff on this event yet — add people on the Staffing tab.
        </p>
      ) : (
        <div className="mt-2 flex max-h-36 flex-col gap-1.5 overflow-y-auto pb-1">
          {staffOptions.map((option) => (
            <label
              key={option.personId}
              className="inline-flex items-center gap-1.5 text-sm text-ink"
            >
              <input
                type="checkbox"
                className="accent-brand"
                checked={personSet.has(option.personId)}
                disabled={disabled}
                onChange={() => togglePerson(option.personId)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </details>
  );
}
