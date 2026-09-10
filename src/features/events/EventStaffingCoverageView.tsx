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
  readonly notes?: string | null;
  readonly cancellationReason?: string | null;
  readonly previousStaffNeedId?: string | null;
  readonly coverageContinuedAt?: number | null;
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
  canManage = false,
  currentPersonId = null,
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
  onReleaseClaim,
  onCancel,
  onChangeCoverage,
  conflictsFor,
}: {
  roster: readonly StaffingRosterEntry[];
  canManage?: boolean;
  currentPersonId?: string | null;
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
  onReleaseClaim?: (need: EventStaffNeedRow) => void;
  onCancel: (need: EventStaffNeedRow) => void;
  onChangeCoverage?: (need: EventStaffNeedRow) => void;
  conflictsFor: (
    personId: string,
    windows?: readonly { startsAt?: number | null; endsAt?: number | null }[],
  ) => StaffingConflictSummary;
}) {
  const openNeeds = eventNeeds.filter(
    (need) => need.status === "open" || need.status === "claimed",
  );
  const peopleCount = new Set(roster.map((entry) => entry.personId)).size;
  const pastNeeds = eventNeeds.filter(
    (need) => need.status === "filled" || need.status === "cancelled",
  );

  return (
    <>
      <section className="card overflow-hidden">
        <CardHeader
          title="Assigned staff"
          trailing={`${peopleCount} on the roster`}
        />
        <div className="overflow-x-auto">
          <table
            className="block w-full text-base md:table"
            data-testid="event-staffing-roster"
          >
            <thead className="max-md:sr-only md:table-header-group">
              <tr>
                <th className="th">Name &amp; role</th>
                <th className="th">Shift</th>
                <th className="th">Availability</th>
                <th className="th">Status</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {roster.map((entry) => {
                const coveredNeeds = eventNeeds.filter(
                  (need) =>
                    need.status === "filled" &&
                    entry.sourceIds?.includes(need._id),
                );
                const conflict = conflictsFor(
                  entry.personId,
                  entry.shiftWindows?.length
                    ? entry.shiftWindows
                    : (entry.plannedWindows ?? [entry]),
                );
                return (
                  <tr
                    key={entry.key}
                    className="block border-b border-line py-2 last:border-b-0 md:table-row md:py-0"
                    data-testid="event-staffing-roster-row"
                  >
                    <td className="block px-3 py-2 md:table-cell align-top">
                      <Link
                        to="/staff/roster"
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {entry.label}
                      </Link>
                      <p className="font-mono text-xs text-ink-3">
                        {entry.role}
                        {entry.startsAt != null
                          ? ` · ${formatTime(entry.startsAt)}`
                          : ""}
                      </p>
                    </td>
                    <td className="block px-3 py-2 md:table-cell align-top font-mono text-xs whitespace-nowrap text-ink-2">
                      <span className="mr-2 font-sans md:hidden">Shift:</span>
                      {(entry.shiftWindows?.length
                        ? entry.shiftWindows
                        : (entry.plannedWindows ?? [entry])
                      ).map((window, index) => (
                        <span className="block" key={index}>
                          {window.startsAt != null
                            ? `${entry.shiftWindows?.length ? "" : "Planned: "}${formatTime(window.startsAt)} – ${window.endsAt != null ? formatTime(window.endsAt) : "End time needed"}`
                            : window.endsAt != null
                              ? `Start time needed – ${formatTime(window.endsAt)}`
                              : "Timing needed"}
                        </span>
                      ))}
                    </td>
                    <td
                      className={`${conflict.available || conflict.overlappingShifts.length || conflict.approvedOff.length ? "block" : "hidden"} px-3 py-2 md:table-cell align-top`}
                    >
                      <AvailabilityChips conflict={conflict} />
                    </td>
                    <td className="block px-3 py-2 md:table-cell align-top">
                      <StatusChip status={String(entry.status)} />
                    </td>
                    <td
                      className={`${canManage && (entry.unassign || coveredNeeds.length) ? "block" : "hidden"} px-3 py-2 md:table-cell text-right align-top`}
                    >
                      {canManage && entry.unassign ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={busy != null}
                          onClick={() => onUnassign(entry)}
                        >
                          Unassign
                        </button>
                      ) : !canManage || coveredNeeds.length === 0 ? (
                        <span className="text-base text-ink-3">—</span>
                      ) : null}
                      {canManage
                        ? coveredNeeds.map((need) => (
                            <div
                              key={need._id}
                              className="flex flex-wrap justify-end gap-1"
                            >
                              {onChangeCoverage ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm max-md:min-h-10"
                                  disabled={busy != null}
                                  onClick={() => onChangeCoverage(need)}
                                  aria-label={`Change ${need.role} coverage for ${entry.label}${need.startsAt != null ? ` at ${formatTime(need.startsAt)}` : ""}`}
                                >
                                  Change coverage
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm max-md:min-h-10"
                                disabled={busy != null}
                                aria-label={`Remove ${need.role} coverage for ${entry.label}${need.startsAt != null ? ` at ${formatTime(need.startsAt)}` : ""}`}
                                onClick={() => onCancel(need)}
                              >
                                Remove {need.role} coverage
                              </button>
                            </div>
                          ))
                        : null}
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
          trailing={`${openNeeds.length} awaiting cover`}
        >
          {postForm ? <div className="mt-2.5">{postForm}</div> : null}
        </CardHeader>
        <div className="overflow-x-auto">
          <table
            className="block w-full text-base md:table"
            data-testid="event-staff-needs"
          >
            <thead className="max-md:sr-only md:table-header-group">
              <tr>
                <th className="th">Shift</th>
                <th className="th">Status</th>
                <th className="th">Cover with</th>
                <th className="th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {openNeeds.map((need) => {
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
                    className="block border-b border-line py-2 last:border-b-0 md:table-row md:py-0"
                    data-testid="event-staff-need-row"
                  >
                    <td className="block px-3 py-2 md:table-cell align-top">
                      <p
                        className="font-medium"
                        data-testid="event-staff-need-title"
                      >
                        {title}
                      </p>
                      <p className="text-sm text-ink-3">
                        {need.description || "No description"}
                        {need.startsAt != null
                          ? ` · ${formatDate(need.startsAt)} ${formatTime(need.startsAt)}${need.endsAt != null ? ` – ${formatTime(need.endsAt)}` : " · End time needed"}`
                          : " · Timing needed"}
                      </p>
                    </td>
                    <td className="block px-3 py-2 md:table-cell align-top">
                      <StatusChip status={String(need.status)} />
                    </td>
                    <td
                      className={`${canManage && claimable ? "block" : "hidden"} px-3 py-2 md:table-cell align-top`}
                    >
                      {canManage && claimable && activePeople.length > 0 ? (
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
                              const conflict = conflictsFor(person._id, [need]);
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
                    <td
                      className={`${claimable ? "block" : "hidden"} px-3 py-2 md:table-cell align-top`}
                    >
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {canManage && claimable && activePeople.length > 0 ? (
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
                        {!canManage &&
                        need.status === "open" &&
                        currentPersonId ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => onClaim(need, currentPersonId)}
                          >
                            Volunteer
                          </button>
                        ) : null}
                        {onReleaseClaim &&
                        need.status === "claimed" &&
                        (canManage ||
                          need.claimedByPersonId === currentPersonId) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => onReleaseClaim(need)}
                          >
                            Release hold
                          </button>
                        ) : null}
                        {canManage && claimable ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null}
                            onClick={() => onCancel(need)}
                          >
                            Cancel
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {openNeeds.length === 0 ? (
          <p className="empty-state">No shifts awaiting cover.</p>
        ) : null}
        {pastNeeds.length > 0 ? (
          <details className="border-t border-line px-4 py-3">
            <summary className="cursor-pointer text-sm font-medium text-ink-2">
              Covered and cancelled requests ({pastNeeds.length})
            </summary>
            <div className="mt-3 divide-y divide-line">
              {pastNeeds.map((need) => {
                const personId =
                  EventTimelineStaffRoster.personIdForNeed(need) ??
                  need.filledByPersonId;
                const person = people?.find((row) => row._id === personId);
                const continuations = eventNeeds.filter(
                  (row) => row.previousStaffNeedId === need._id,
                );
                return (
                  <div
                    key={need._id}
                    className="py-3"
                    data-testid="event-staff-need-row"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p
                        className="text-base font-medium"
                        data-testid="event-staff-need-title"
                      >
                        {EventTimelineStaffRoster.titleForNeed(need, person)}
                      </p>
                      <StatusChip status={String(need.status)} />
                    </div>
                    {need.description ? (
                      <p className="mt-1 text-base text-ink-2">
                        {need.description}
                      </p>
                    ) : null}
                    {need.status === "cancelled" && person ? (
                      <p className="mt-1 text-base text-ink-2">
                        Previously covered by {personLabel(person)}
                      </p>
                    ) : null}
                    {need.notes ? (
                      <p className="mt-1 text-base text-ink-2">{need.notes}</p>
                    ) : null}
                    {need.cancellationReason ? (
                      <p className="mt-1 text-base text-ink-2">
                        Cancelled: {need.cancellationReason}
                      </p>
                    ) : null}
                    {continuations.length ? (
                      <p className="mt-1 text-base text-ink-2">
                        Replacement coverage:{" "}
                        {continuations
                          .map((row) => {
                            const covering = people?.find(
                              (person) =>
                                person._id ===
                                (EventTimelineStaffRoster.personIdForNeed(
                                  row,
                                ) ?? row.filledByPersonId),
                            );
                            return `${covering ? personLabel(covering) : row.status === "cancelled" ? "Unfilled request" : "Open for volunteers"}${row.startsAt != null ? ` · ${formatTime(row.startsAt)}${row.endsAt != null ? `–${formatTime(row.endsAt)}` : ""}` : ""} (${row.status})`;
                          })
                          .join("; ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm text-ink-3">
                      {need.startsAt != null
                        ? `${formatDate(need.startsAt)} ${formatTime(need.startsAt)}${need.endsAt != null ? ` – ${formatTime(need.endsAt)}` : " · End time needed"}`
                        : "Timing needed"}
                    </p>
                    {canManage &&
                    onChangeCoverage &&
                    need.status === "cancelled" &&
                    need.coverageContinuedAt == null ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm mt-2 max-md:min-h-10"
                        disabled={busy != null}
                        onClick={() => onChangeCoverage(need)}
                        aria-label={`Reopen ${need.role} request${need.startsAt != null ? ` at ${formatTime(need.startsAt)}` : ""}`}
                      >
                        Reopen request
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}
      </section>
    </>
  );
}
