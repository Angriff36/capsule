import { useMemo, useState, type FormEvent } from "react";
import {
  useCreateEventAssignment,
  useCreateEventStaffNeed,
  useEventAssignmentUnassign,
  useEventStaffNeedCancel,
  useEventStaffNeedClaim,
  useEventStaffNeedFill,
  useEventStaffNeedReleaseClaim,
  useGetEvent,
  useListAvailabilityWindow,
  useListEventAssignment,
  useListEventStaffNeed,
  useListEventTimelineActivity,
  useListPerson,
  useListShift,
  useListShiftType,
  useListTimeOffRequest,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
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

export function EventStaffingTab({ eventId }: Props) {
  const auth = useAuthStatus();
  const event = useGetEvent(eventId);
  const canManage = event?.staffingCanManage === true;
  const assignments = useListEventAssignment();
  const needs = useListEventStaffNeed();
  const people = useListPerson();
  const shifts = useListShift();
  const shiftTypes = useListShiftType();
  const activities = useListEventTimelineActivity();
  const timeOff = useListTimeOffRequest();
  const availability = useListAvailabilityWindow();
  const createAssignment = useCreateEventAssignment();
  const unassign = useEventAssignmentUnassign();
  const createNeed = useCreateEventStaffNeed();
  const claimNeed = useEventStaffNeedClaim();
  const fillNeed = useEventStaffNeedFill();
  const releaseClaim = useEventStaffNeedReleaseClaim();
  const cancelNeed = useEventStaffNeedCancel();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
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
        shifts,
      }),
    [eventAssignments, eventId, eventNeeds, people, shifts],
  );

  const crewWindow = {
    startsAt: activities?.find(
      (row) =>
        row.eventId === eventId &&
        row.deletedAt == null &&
        row.timingMilestone === "staff_on",
    )?.startsAt,
    endsAt: activities?.find(
      (row) =>
        row.eventId === eventId &&
        row.deletedAt == null &&
        row.timingMilestone === "staff_off",
    )?.startsAt,
  };

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

  const rosterWithShifts = roster;

  const conflictsFor = (
    personId: string,
    plannedWindows: readonly {
      startsAt?: number | null;
      endsAt?: number | null;
    }[] = [crewWindow],
  ) => {
    const windows = plannedWindows.filter(
      (window) => window.startsAt != null && window.endsAt != null,
    );
    const overlaps = (
      start: number | null | undefined,
      end: number | null | undefined,
    ) =>
      start != null &&
      end != null &&
      windows.some(
        (window) => start < window.endsAt! && end > window.startsAt!,
      );
    const overlappingShifts = (shifts ?? []).filter(
      (shift) =>
        shift.deletedAt == null &&
        shift.personId === personId &&
        shift.status !== "cancelled" &&
        overlaps(shift.startsAt, shift.endsAt) &&
        shift.eventId !== eventId,
    );
    const approvedOff = (timeOff ?? []).filter(
      (row) =>
        row.deletedAt == null &&
        row.personId === personId &&
        String(row.status) === "approved" &&
        overlaps(row.startsAt, row.endsAt),
    );
    const available =
      windows.length > 0 &&
      windows.every((window) =>
        (availability ?? []).some(
          (row) =>
            row.deletedAt == null &&
            row.personId === personId &&
            row.startsAt != null &&
            row.endsAt != null &&
            row.startsAt <= window.startsAt! &&
            row.endsAt >= window.endsAt!,
        ),
      );
    return { overlappingShifts, approvedOff, available };
  };

  const conflictNotes: StaffingConflictNote[] = [];
  for (const entry of rosterWithShifts) {
    const conflict = conflictsFor(
      entry.personId,
      entry.shiftWindows?.length
        ? entry.shiftWindows
        : (entry.plannedWindows ?? [entry]),
    );
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
  const rosterPeopleCount = new Set(roster.map((entry) => entry.personId)).size;

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

  if (
    assignments === undefined ||
    needs === undefined ||
    people === undefined
  ) {
    return (
      <section
        aria-busy="true"
        role="status"
        className="py-4 text-base text-ink-2"
      >
        Loading event staffing…
      </section>
    );
  }

  return (
    <section className="space-y-4" data-testid="event-staffing-tab">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-line pb-3">
        <div>
          <h2 className="font-display text-2xl leading-none text-ink">
            Event staff
          </h2>
          <p className="mt-1.5 text-base text-ink-2">
            {rosterPeopleCount} on the roster · {openShiftCount} shift
            {openShiftCount === 1 ? "" : "s"} still to cover
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base text-ink-3">
            Crew, planned times, open shifts, and availability conflicts.
          </p>
        </div>
      </header>
      {failure ? <FailureBanner failure={failure} /> : null}
      {activities !== undefined &&
      (crewWindow.startsAt == null || crewWindow.endsAt == null) ? (
        <p
          role="status"
          className="border-y border-line py-2 text-base text-ink-2"
        >
          Crew timing needs attention. Complete staff-on and staff-off in
          Timeline; assignments can be saved while their shift times are being
          planned.
        </p>
      ) : null}
      {host}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {canManage ? (
            <form
              className="card grid gap-2 px-4 py-3 sm:grid-cols-4"
              onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                formEvent.preventDefault();
                const data = new FormData(formEvent.currentTarget);
                const personId = String(data.get("personId") ?? "");
                const role = readStaffRole(data, "role");
                if (!personId || !role) return;
                const form = formEvent.currentTarget;
                void run("assign", async () => {
                  await createAssignment({
                    eventId,
                    personId,
                    role,
                  });
                  form.reset();
                });
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
                disabled={busy != null}
              >
                Assign
              </button>
            </form>
          ) : null}

          <EventStaffingCoverageView
            roster={rosterWithShifts}
            canManage={canManage}
            currentPersonId={auth?.personId ?? null}
            eventNeeds={eventNeeds as EventStaffNeedRow[]}
            people={people ?? []}
            activePeople={activePeople}
            busy={busy}
            needPersonIds={needPersonIds}
            postForm={
              canManage ? (
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
                    const form = formEvent.currentTarget;
                    void run("postOpen", async () => {
                      await createNeed({
                        eventId,
                        role,
                        description: description || undefined,
                      });
                      form.reset();
                    });
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
              ) : undefined
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
              void run(`unassign:${target.docId}`, async () => {
                await unassign({
                  docId: target.docId,
                  version: target.version,
                });
              });
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
            onReleaseClaim={(need) =>
              void run(`release:${need._id}`, () =>
                releaseClaim({ docId: need._id, version: need.version }),
              )
            }
            onCancel={(need) => {
              void (async () => {
                const reason = await prompt.askReason({
                  title:
                    need.status === "filled"
                      ? "Remove covered request"
                      : "Cancel open shift",
                  description:
                    need.status === "filled"
                      ? "Remove this staffing requirement and its future coverage. Other assigned roles and recorded work stay intact."
                      : "Record why this open shift is coming down.",
                  label: "Cancellation reason",
                  placeholder: "e.g. Covered by a reassignment",
                  confirmLabel:
                    need.status === "filled"
                      ? "Remove coverage"
                      : "Cancel shift",
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
