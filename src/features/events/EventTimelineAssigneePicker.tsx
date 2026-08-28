import { UsersIcon } from "../../ui/icons";
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

  const labels = new Map(
    staffOptions.map((option) => [option.personId, option.label] as const),
  );
  const assignedNames = selection.personIds.map(
    (personId) => labels.get(personId) ?? "Staff",
  );
  // Blocks written before the multi-select shipped carry only the legacy
  // responsibleParty string; show it as chips so nothing reads as unassigned.
  const legacyNames =
    assignedNames.length === 0 &&
    selection.teams.length === 0 &&
    summaryLabel?.trim()
      ? summaryLabel.split(", ").filter(Boolean)
      : [];
  const names = assignedNames.length > 0 ? assignedNames : legacyNames;
  const shown = names.slice(0, 4);
  const overflow = names.length - shown.length;
  const teamLabel =
    selection.teams.length > 0
      ? selection.teams.join(" · ")
      : names.length === 0
        ? "Anyone"
        : "";

  return (
    <details
      className="group rounded-sm border border-line-2 bg-canvas px-2.5 py-1.5"
      data-testid="timeline-assignee-picker"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-ink-2 marker:content-none">
        <UsersIcon className="shrink-0 text-ink-3" />
        {teamLabel ? (
          <span
            className={
              selection.teams.length === 0
                ? "text-ink-3"
                : "font-medium text-ink"
            }
          >
            {teamLabel}
          </span>
        ) : null}
        {shown.map((name) => (
          <span key={name} className="chip-meta text-sm">
            {name}
          </span>
        ))}
        {overflow > 0 ? (
          <span className="chip-meta text-sm text-ink-3">+{overflow} more</span>
        ) : null}
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
              aria-label={team}
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
                aria-label={option.label}
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
