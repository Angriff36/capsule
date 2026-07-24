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
  readonly onChange: (next: TimelineAssigneeSelection) => void;
};

/** Multi-select for Everyone/FOH/BOH plus event-staffed people. */
export function EventTimelineAssigneePicker({
  selection,
  staffOptions,
  disabled = false,
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

  return (
    <div
      className="space-y-2 rounded-sm border border-line-2 bg-canvas px-2.5 py-2"
      data-testid="timeline-assignee-picker"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">
        Assigned to
      </p>
      <div className="flex flex-wrap gap-3">
        {TIMELINE_ASSIGNEE_TEAMS.map((team) => (
          <label
            key={team}
            className="inline-flex items-center gap-1.5 text-[12.5px] text-ink"
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
        <p className="text-[12px] text-ink-3">
          No staff on this event yet — add people on the Staffing tab.
        </p>
      ) : (
        <div className="flex max-h-36 flex-col gap-1.5 overflow-y-auto">
          {staffOptions.map((option) => (
            <label
              key={option.personId}
              className="inline-flex items-center gap-1.5 text-[12.5px] text-ink"
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
    </div>
  );
}
