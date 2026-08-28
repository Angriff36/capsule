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

function CardHeader({
  title,
  trailing,
  children,
}: {
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-line bg-inset px-4 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-bold tracking-[0.06em] text-ink uppercase">
          {title}
        </h3>
        {trailing ? (
          <span className="font-mono text-xs text-ink-3">{trailing}</span>
        ) : null}
      </div>
      {children}
    </header>
  );
}

function AvailabilityChips({
  conflict,
}: {
  conflict: StaffingConflictSummary;
}) {
  const chips: ReactNode[] = [];
  if (conflict.overlappingShifts.length > 0) {
    chips.push(
      <span key="shift" className="chip border-warn/30 bg-warn-soft text-warn">
        Overlapping shift
      </span>,
    );
  }
  if (conflict.approvedOff.length > 0) {
    chips.push(
      <span
        key="off"
        className="chip border-danger/30 bg-danger-soft text-danger"
      >
        Approved time off
      </span>,
    );
  }
  if (chips.length === 0 && conflict.available) {
    chips.push(
      <span key="ok" className="chip border-ok/30 bg-ok-soft text-ok">
        Window ok
      </span>,
    );
  }
  if (chips.length === 0) {
    return <span className="text-base text-ink-3">—</span>;
  }
  return <span className="flex flex-wrap gap-1.5">{chips}</span>;
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
  const openNeeds = eventNeeds.filter(
    (need) => need.status === "open" || need.status === "claimed",
  ).length;

  return (
    <>
      <section className="card overflow-hidden">
        <CardHeader
          title="Assigned staff"
          trailing={`${roster.length} on the roster`}
        />
        <div className="overflow-x-auto">
          <table
            className="w-full text-base"
            data-testid="event-staffing-roster"
          >
            <thead>
              <tr>
                <th className="th">Name &amp; role</th>
                <th className="th">Shift</th>
                <th className="th">Availability</th>
                <th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((entry) => {
                const conflict = conflictsFor(entry.personId);
                return (
                  <tr
                    key={entry.key}
                    className="border-b border-line last:border-b-0"
                    data-testid="event-staffing-roster-row"
                  >
                    <td className="px-3 py-2 align-top">
                      <Link
                        to="/staff/roster"
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {entry.label}
                      </Link>
                      <p className="font-mono text-xs text-ink-3">
                        {entry.role}
                        {entry.startsAt
                          ? ` · ${formatTime(entry.startsAt)}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top font-mono text-xs whitespace-nowrap text-ink-2">
                      {entry.startsAt ? formatTime(entry.startsAt) : "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <AvailabilityChips conflict={conflict} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <StatusChip status={String(entry.status)} />
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      {entry.unassign ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => onUnassign(entry)}
                        >
                          Unassign
                        </button>
                      ) : (
                        <span className="text-base text-ink-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {roster.length === 0 ? (
          <p className="empty-state">No staff assigned yet.</p>
        ) : null}
      </section>

      <section className="card overflow-hidden">
        <CardHeader
          title="Open / claimable shifts"
          trailing={`${openNeeds} awaiting cover`}
        >
          {postForm ? <div className="mt-2.5">{postForm}</div> : null}
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-base" data-testid="event-staff-needs">
            <thead>
              <tr>
                <th className="th">Shift</th>
                <th className="th">Status</th>
                <th className="th">Cover with</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {eventNeeds.map((need) => {
                const coveringId =
                  EventTimelineStaffRoster.personIdForNeed(need);
                const covering = coveringId
                  ? people?.find((row) => row._id === coveringId)
                  : undefined;
                const title = EventTimelineStaffRoster.titleForNeed(
                  need,
                  covering,
                );
                const claimable =
                  need.status === "open" || need.status === "claimed";
                return (
                  <tr
                    key={need._id}
                    className="border-b border-line last:border-b-0"
                    data-testid="event-staff-need-row"
                  >
                    <td className="px-3 py-2 align-top">
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
                    </td>
                    <td className="px-3 py-2 align-top">
                      <StatusChip status={String(need.status)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      {claimable && activePeople.length > 0 ? (
                        <label className="field-label">
                          <span className="sr-only">
                            Person for {need.role}
                          </span>
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
                      ) : (
                        <span className="text-base text-ink-3">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {claimable && activePeople.length > 0 ? (
                          <>
                            {need.status === "open" ? (
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={
                                  busy != null || !needPersonIds[need._id]
                                }
                                onClick={() =>
                                  onClaim(need, needPersonIds[need._id]!)
                                }
                              >
                                Hold for them
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={
                                busy != null || !needPersonIds[need._id]
                              }
                              onClick={() =>
                                onFill(need, needPersonIds[need._id]!)
                              }
                            >
                              Fill shift
                            </button>
                          </>
                        ) : null}
                        {claimable ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => onCancel(need)}
                          >
                            Cancel
                          </button>
                        ) : (
                          <span className="text-base text-ink-3">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {eventNeeds.length === 0 ? (
          <p className="empty-state">
            No open shifts posted. Post one so eligible staff can claim it.
          </p>
        ) : null}
      </section>
    </>
  );
}
