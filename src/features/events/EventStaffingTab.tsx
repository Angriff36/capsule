import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  useCreateEventAssignment,
  useCreateEventStaffNeed,
  useEventAssignmentUnassign,
  useEventStaffNeedCancel,
  useEventStaffNeedClaim,
  useEventStaffNeedFill,
  useListAvailabilityWindow,
  useListEventAssignment,
  useListEventStaffNeed,
  useListEventTimelineActivity,
  useListPerson,
  useListShift,
  useListShiftType,
  useListTimeOffRequest,
} from "../../lib/manifest-convex-react";
import type { Id } from "../../lib/api";
import { useScheduleShift } from "../../lib/workforceScheduling";
import { useActionPrompt } from "../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import {
  EventStaffingCoverageView,
  type EventStaffNeedRow,
} from "./EventStaffingCoverageView";
import {
  EventStaffingSummaryAside,
  type StaffingConflictNote,
} from "./EventStaffingSummaryAside";
import { FailureBanner } from "./FailureBanner";
import {
  StaffRoleSelect,
  collectStaffRoles,
  readStaffRole,
} from "./EventStaffingRoleSelect";
import { eventShiftFor, shiftWindowFor } from "./eventStaffShifts";
import {
  EventTimelineStaffRoster,
  type PersonRow,
} from "./eventTimelineStaffRoster";

type Props = {
  eventId: string;
  startsAt?: number | null;
  endsAt?: number | null;
};

function personLabel(person: PersonRow): string {
  return EventTimelineStaffRoster.labelFor(person);
}

export function EventStaffingTab({ eventId, startsAt, endsAt }: Props) {
  const assignments = useListEventAssignment();
  const needs = useListEventStaffNeed();
  const people = useListPerson();
  const shifts = useListShift();
  const shiftTypes = useListShiftType();
  const activities = useListEventTimelineActivity();
  const timeOff = useListTimeOffRequest();
  const availability = useListAvailabilityWindow();
  const createAssignment = useCreateEventAssignment();
  // Authored atomic seam: repeats Shift.schedule checks and rejects approved
  // time-off overlap in one transaction (docs/systems/workforce.md).
  const scheduleShift = useScheduleShift();
  const unassign = useEventAssignmentUnassign();
  const createNeed = useCreateEventStaffNeed();
  const claimNeed = useEventStaffNeedClaim();
  const fillNeed = useEventStaffNeedFill();
  const cancelNeed = useEventStaffNeedCancel();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);
  // Handlers read the latest rows, not the render they were created in.
  const shiftsRef = useRef(shifts);
  shiftsRef.current = shifts;
  const activitiesRef = useRef(activities);
  activitiesRef.current = activities;
  /** Shift scheduling needs both lists loaded to avoid duplicates. */
  const shiftDataReady = shifts !== undefined && activities !== undefined;
  const [needPersonIds, setNeedPersonIds] = useState<Record<string, string>>(
    {},
  );
  const { prompt, host } = useActionPrompt(busy != null);

  const eventAssignments = useMemo(
    () =>
      (assignments ?? []).filter(
        (row) =>
          row.deletedAt == null &&
          row.eventId === eventId &&
          row.status !== "unassigned",
      ),
    [assignments, eventId],
  );
  const eventNeeds = useMemo(
    () =>
      (needs ?? []).filter(
        (row) => row.deletedAt == null && row.eventId === eventId,
      ),
    [eventId, needs],
  );
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const roster = useMemo(
    () =>
      EventTimelineStaffRoster.staffingRosterEntries({
        eventId,
        assignments: eventAssignments,
        people: people ?? [],
        staffNeeds: eventNeeds,
      }),
    [eventAssignments, eventId, eventNeeds, people],
  );

  const windowStart = Number(startsAt ?? 0);
  const windowEnd = Number(endsAt ?? startsAt ?? 0);

  const roleOptions = useMemo(
    () =>
      collectStaffRoles({
        shiftTypeNames: (shiftTypes ?? [])
          .filter((row) => row.deletedAt == null && row.status === "active")
          .map((row) => String(row.name ?? "")),
        usedRoles: [
          ...(assignments ?? []).map((row) => String(row.role ?? "")),
          ...(needs ?? []).map((row) => String(row.role ?? "")),
        ],
      }),
    [assignments, needs, shiftTypes],
  );

  /** Roster rows carry the scheduled shift window (timeline-derived). */
  const rosterWithShifts = useMemo(
    () =>
      roster.map((entry) => {
        const shift = eventShiftFor(shifts, eventId, entry.personId);
        if (!shift?.startsAt) return entry;
        return { ...entry, startsAt: shift.startsAt, endsAt: shift.endsAt };
      }),
    [eventId, roster, shifts],
  );

  /** Schedule a Shift for this person from their timeline blocks (or the event window). */
  const scheduleEventShift = async (personId: string, role: string) => {
    const liveShifts = shiftsRef.current;
    if (liveShifts === undefined) return;
    if (eventShiftFor(liveShifts, eventId, personId)) return;
    const window = shiftWindowFor({
      eventId,
      personId,
      activities: activitiesRef.current,
      eventStartsAt: startsAt,
      eventEndsAt: endsAt,
    });
    if (!window) return;
    await scheduleShift({
      personId: personId as Id<"people">,
      eventId: eventId as Id<"events">,
      role,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
    });
  };
  const rosterMissingShift = roster.filter(
    (entry) => !eventShiftFor(shifts, eventId, entry.personId),
  );
  // The notice is about a missing shift; once none is missing it is stale.
  useEffect(() => {
    if (shiftNotice && shiftDataReady && rosterMissingShift.length === 0) {
      setShiftNotice(null);
    }
  }, [rosterMissingShift.length, shiftDataReady, shiftNotice]);

  const conflictsFor = (personId: string) => {
    const overlappingShifts = (shifts ?? []).filter(
      (shift) =>
        shift.deletedAt == null &&
        shift.personId === personId &&
        shift.status !== "cancelled" &&
        Number(shift.startsAt ?? 0) < windowEnd &&
        Number(shift.endsAt ?? 0) > windowStart &&
        shift.eventId !== eventId,
    );
    const approvedOff = (timeOff ?? []).filter(
      (row) =>
        row.deletedAt == null &&
        row.personId === personId &&
        String(row.status) === "approved" &&
        Number(row.startsAt ?? 0) < windowEnd &&
        Number(row.endsAt ?? 0) > windowStart,
    );
    const available = (availability ?? []).some(
      (row) =>
        row.deletedAt == null &&
        row.personId === personId &&
        Number(row.startsAt ?? 0) <= windowStart &&
        Number(row.endsAt ?? Date.now()) >= windowEnd,
    );
    return { overlappingShifts, approvedOff, available };
  };

  const conflictNotes: StaffingConflictNote[] = [];
  for (const entry of roster) {
    const conflict = conflictsFor(entry.personId);
    const reasons: string[] = [];
    if (conflict.overlappingShifts.length > 0)
      reasons.push("Overlapping shift");
    if (conflict.approvedOff.length > 0) reasons.push("Approved time off");
    if (reasons.length > 0) {
      conflictNotes.push({
        key: entry.key,
        label: entry.label,
        role: entry.role,
        reasons,
      });
    }
  }

  const openShiftCount = eventNeeds.filter(
    (need) => need.status === "open" || need.status === "claimed",
  ).length;

  const run = async (key: string, work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4" data-testid="event-staffing-tab">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-3">
        <div>
          <h2 className="font-display text-2xl leading-none text-ink">
            Event staff
          </h2>
          <p className="mt-1.5 text-base text-ink-2">
            {roster.length} on the roster · {openShiftCount} shift
            {openShiftCount === 1 ? "" : "s"} still to cover
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base text-ink-3">
            Assign people, post open shifts for claim, and watch availability
            conflicts.
          </p>
          {rosterMissingShift.length > 0 ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy != null || !shiftDataReady}
              onClick={() =>
                void run("syncShifts", async () => {
                  for (const entry of rosterMissingShift) {
                    await scheduleEventShift(entry.personId, entry.role);
                  }
                  setShiftNotice(null);
                })
              }
            >
              Sync {rosterMissingShift.length} shift
              {rosterMissingShift.length === 1 ? "" : "s"} from timeline
            </button>
          ) : null}
        </div>
      </header>
      {failure ? <FailureBanner failure={failure} /> : null}
      {shiftNotice ? (
        <p
          role="status"
          className="rounded-sm border border-warn/40 bg-warn-soft px-3 py-2 text-sm text-warn"
        >
          {shiftNotice}
        </p>
      ) : null}
      {host}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <form
            className="card grid gap-2 px-4 py-3 sm:grid-cols-4"
            onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
              formEvent.preventDefault();
              const data = new FormData(formEvent.currentTarget);
              const personId = String(data.get("personId") ?? "");
              const role = readStaffRole(data, "role");
              if (!personId || !role) return;
              setShiftNotice(null);
              void run("assign", async () => {
                await createAssignment({
                  eventId,
                  personId,
                  role,
                  startsAt: startsAt ?? undefined,
                  endsAt: endsAt ?? undefined,
                });
                try {
                  await scheduleEventShift(personId, role);
                } catch {
                  // The assignment is saved; only the shift is missing.
                  setShiftNotice(
                    "Assignment saved, but the shift could not be scheduled. Use “Sync shifts from timeline” to retry.",
                  );
                }
              });
              formEvent.currentTarget.reset();
            }}
          >
            <label className="field-label sm:col-span-2">
              Assign person
              <select name="personId" className="field-input" required>
                <option value="">Select…</option>
                {activePeople.map((person) => {
                  const conflict = conflictsFor(person._id);
                  return (
                    <option key={person._id} value={person._id}>
                      {personLabel(person)}
                      {conflict.overlappingShifts.length
                        ? " · shift conflict"
                        : ""}
                      {conflict.approvedOff.length ? " · time off" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field-label">
              Role
              <StaffRoleSelect name="role" roles={roleOptions} />
            </label>
            <button
              type="submit"
              className="btn btn-primary self-end"
              disabled={busy != null || !shiftDataReady}
            >
              Assign
            </button>
          </form>

          <EventStaffingCoverageView
            roster={rosterWithShifts}
            eventNeeds={eventNeeds as EventStaffNeedRow[]}
            people={people ?? []}
            activePeople={activePeople}
            busy={busy}
            needPersonIds={needPersonIds}
            postForm={
              <form
                className="grid gap-2 sm:grid-cols-3"
                onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                  formEvent.preventDefault();
                  const data = new FormData(formEvent.currentTarget);
                  const role = readStaffRole(data, "role");
                  const description = String(
                    data.get("description") ?? "",
                  ).trim();
                  if (!role) return;
                  void run("postOpen", () =>
                    createNeed({
                      eventId,
                      role,
                      description: description || undefined,
                      startsAt: startsAt ?? undefined,
                      endsAt: endsAt ?? undefined,
                    }),
                  );
                  formEvent.currentTarget.reset();
                }}
              >
                <label className="field-label">
                  Role
                  <StaffRoleSelect name="role" roles={roleOptions} />
                </label>
                <label className="field-label">
                  Description
                  <input name="description" className="field-input" />
                </label>
                <button
                  type="submit"
                  className="btn btn-ghost self-end"
                  disabled={busy != null}
                >
                  Post open shift
                </button>
              </form>
            }
            onNeedPersonChange={(needId, personId) =>
              setNeedPersonIds((current) => ({
                ...current,
                [needId]: personId,
              }))
            }
            onUnassign={(entry) => {
              const target = entry.unassign;
              if (!target) return;
              void run(`unassign:${target.docId}`, () =>
                unassign({
                  docId: target.docId,
                  version: target.version,
                }),
              );
            }}
            onClaim={(need, personId) =>
              void run(`claim:${need._id}`, () =>
                claimNeed({
                  docId: need._id,
                  version: need.version,
                  personId,
                }),
              )
            }
            onFill={(need, personId) =>
              void run(`fill:${need._id}`, () =>
                fillNeed({
                  docId: need._id,
                  version: need.version,
                  personId,
                }),
              )
            }
            onCancel={(need) => {
              void (async () => {
                const reason = await prompt.askReason({
                  title: "Cancel open shift",
                  description: "Record why this open shift is coming down.",
                  label: "Cancellation reason",
                  placeholder: "e.g. Covered by a reassignment",
                  confirmLabel: "Cancel shift",
                  tone: "danger",
                });
                if (!reason) return;
                void run(`cancel:${need._id}`, () =>
                  cancelNeed({
                    docId: need._id,
                    version: need.version,
                    reason,
                  }),
                );
              })();
            }}
            conflictsFor={conflictsFor}
          />
        </div>
        <EventStaffingSummaryAside
          roster={roster}
          needs={eventNeeds as EventStaffNeedRow[]}
          conflicts={conflictNotes}
        />
      </div>
    </section>
  );
}
