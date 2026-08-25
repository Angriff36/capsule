import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTime } from "../../lib/format";
import { StatusChip } from "../../ui/primitives";
import {
  EventTimelineStaffRoster,
  type PersonRow,
  type StaffingRosterEntry,
  type StaffNeedRow,
} from "./eventTimelineStaffRoster";

export type EventStaffNeedRow = StaffNeedRow & {
  readonly _id: string;
  readonly version: number;
  readonly description?: string | null;
  readonly startsAt?: number | null;
};

export type StaffingConflictSummary = {
  overlappingShifts: readonly unknown[];
  approvedOff: readonly unknown[];
  available: boolean;
};

function personLabel(person: PersonRow): string {
  return EventTimelineStaffRoster.labelFor(person);
}

export function EventStaffingCoverageView({
  roster,
  eventNeeds,
  people,
  activePeople,
  busy,
  needPersonIds,
  postForm,
  onNeedPersonChange,
  onUnassign,
  onClaim,
  onFill,
  onCancel,
  conflictsFor,
}: {
  roster: readonly StaffingRosterEntry[];
  eventNeeds: readonly EventStaffNeedRow[];
  people: readonly PersonRow[] | undefined;
  activePeople: readonly PersonRow[];
  busy: string | null;
  needPersonIds: Record<string, string>;
  postForm?: ReactNode;
  onNeedPersonChange: (needId: string, personId: string) => void;
  onUnassign: (entry: StaffingRosterEntry) => void;
  onClaim: (need: EventStaffNeedRow, personId: string) => void;
  onFill: (need: EventStaffNeedRow, personId: string) => void;
  onCancel: (need: EventStaffNeedRow) => void;
  conflictsFor: (personId: string) => StaffingConflictSummary;
}) {
  return (
    <>
      <ul
        className="divide-y divide-line border border-line"
        data-testid="event-staffing-roster"
      >
        {roster.map((entry) => {
          const conflict = conflictsFor(entry.personId);
          return (
            <li
              key={entry.key}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              data-testid="event-staffing-roster-row"
            >
              <div>
                <Link
                  to="/staff/roster"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {entry.label}
                </Link>
                <p className="font-mono text-xs text-ink-3">
                  {entry.role}
                  {entry.startsAt ? ` · ${formatTime(entry.startsAt)}` : ""}
                  {conflict.overlappingShifts.length
                    ? " · overlapping shift"
                    : ""}
                  {conflict.approvedOff.length ? " · approved time off" : ""}
                  {conflict.available ? " · availability window ok" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={String(entry.status)} />
                {entry.unassign ? (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy != null}
                    onClick={() => onUnassign(entry)}
                  >
                    Unassign
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
        {roster.length === 0 ? (
          <li className="px-3 py-3 text-base text-ink-3">
            No staff assigned yet.
          </li>
        ) : null}
      </ul>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Open / claimable shifts</h3>
        {postForm}
        <ul
          className="divide-y divide-line border border-line"
          data-testid="event-staff-needs"
        >
          {eventNeeds.map((need) => {
            const coveringId = EventTimelineStaffRoster.personIdForNeed(need);
            const covering = coveringId
              ? people?.find((row) => row._id === coveringId)
              : undefined;
            const title = EventTimelineStaffRoster.titleForNeed(need, covering);
            return (
              <li
                key={need._id}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                data-testid="event-staff-need-row"
              >
                <div>
                  <p
                    className="font-medium"
                    data-testid="event-staff-need-title"
                  >
                    {title}
                  </p>
                  <p className="text-sm text-ink-3">
                    {need.description || "No description"}
                    {need.startsAt
                      ? ` · ${formatDate(need.startsAt)} ${formatTime(need.startsAt)}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={String(need.status)} />
                  {(need.status === "open" || need.status === "claimed") &&
                  activePeople.length > 0 ? (
                    <>
                      <label className="field-label">
                        <span className="sr-only">Person for {need.role}</span>
                        <select
                          className="field-input w-44"
                          value={needPersonIds[need._id] ?? ""}
                          disabled={busy != null}
                          onChange={(changeEvent) =>
                            onNeedPersonChange(
                              need._id,
                              changeEvent.target.value,
                            )
                          }
                        >
                          <option value="">Choose person…</option>
                          {activePeople.map((person) => {
                            const conflict = conflictsFor(person._id);
                            return (
                              <option key={person._id} value={person._id}>
                                {personLabel(person)}
                                {conflict.overlappingShifts.length
                                  ? " · shift conflict"
                                  : ""}
                                {conflict.approvedOff.length
                                  ? " · time off"
                                  : ""}
                              </option>
                            );
                          })}
                        </select>
                      </label>
                      {need.status === "open" ? (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          disabled={busy != null || !needPersonIds[need._id]}
                          onClick={() =>
                            onClaim(need, needPersonIds[need._id]!)
                          }
                        >
                          Hold for them
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busy != null || !needPersonIds[need._id]}
                        onClick={() => onFill(need, needPersonIds[need._id]!)}
                      >
                        Fill shift
                      </button>
                    </>
                  ) : null}
                  {need.status === "open" || need.status === "claimed" ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy != null}
                      onClick={() => onCancel(need)}
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
          {eventNeeds.length === 0 ? (
            <li className="px-3 py-3 text-base text-ink-3">
              No open shifts posted. Post one so eligible staff can claim it.
            </li>
          ) : null}
        </ul>
      </div>
    </>
  );
}
