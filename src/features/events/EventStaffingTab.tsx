import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatDate, formatTime } from "../../lib/format";
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
  useListPerson,
  useListShift,
  useListTimeOffRequest,
} from "../../lib/manifest-convex-react";
import { StatusChip } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

type Props = {
  eventId: string;
  startsAt?: number | null;
  endsAt?: number | null;
};

function personLabel(person: {
  givenName?: string | null;
  familyName?: string | null;
}): string {
  return (
    [person.givenName, person.familyName].filter(Boolean).join(" ") || "Staff"
  );
}

export function EventStaffingTab({ eventId, startsAt, endsAt }: Props) {
  const assignments = useListEventAssignment();
  const needs = useListEventStaffNeed();
  const people = useListPerson();
  const shifts = useListShift();
  const timeOff = useListTimeOffRequest();
  const availability = useListAvailabilityWindow();
  const createAssignment = useCreateEventAssignment();
  const unassign = useEventAssignmentUnassign();
  const createNeed = useCreateEventStaffNeed();
  const claimNeed = useEventStaffNeedClaim();
  const fillNeed = useEventStaffNeedFill();
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

  const windowStart = Number(startsAt ?? 0);
  const windowEnd = Number(endsAt ?? startsAt ?? 0);

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
      <div>
        <h2 className="font-display text-lg">Staffing</h2>
        <p className="text-base text-ink-2">
          Assign people, post open shifts for claim, and watch availability
          conflicts.
        </p>
      </div>
      {failure ? <FailureBanner failure={failure} /> : null}
      {host}

      <form
        className="grid gap-2 rounded-xs border border-line p-3 sm:grid-cols-4"
        onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
          formEvent.preventDefault();
          const data = new FormData(formEvent.currentTarget);
          const personId = String(data.get("personId") ?? "");
          const role = String(data.get("role") ?? "").trim();
          if (!personId || !role) return;
          void run("assign", () =>
            createAssignment({
              eventId,
              personId,
              role,
              startsAt: startsAt ?? undefined,
              endsAt: endsAt ?? undefined,
            }),
          );
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
                  {conflict.overlappingShifts.length ? " · shift conflict" : ""}
                  {conflict.approvedOff.length ? " · time off" : ""}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field-label">
          Role
          <input
            name="role"
            className="field-input"
            required
            placeholder="Server"
          />
        </label>
        <button
          type="submit"
          className="btn btn-primary self-end"
          disabled={busy != null}
        >
          Assign
        </button>
      </form>

      <ul className="divide-y divide-line border border-line">
        {eventAssignments.map((assignment) => {
          const person = people?.find((row) => row._id === assignment.personId);
          const conflict = conflictsFor(assignment.personId);
          return (
            <li
              key={assignment._id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div>
                <Link
                  to="/staff/roster"
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {person ? personLabel(person) : assignment.personId}
                </Link>
                <p className="font-mono text-xs text-ink-3">
                  {assignment.role}
                  {assignment.startsAt
                    ? ` · ${formatTime(assignment.startsAt)}`
                    : ""}
                  {conflict.overlappingShifts.length
                    ? " · overlapping shift"
                    : ""}
                  {conflict.approvedOff.length ? " · approved time off" : ""}
                  {conflict.available ? " · availability window ok" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={String(assignment.status)} />
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy != null}
                  onClick={() =>
                    void run(`unassign:${assignment._id}`, () =>
                      unassign({
                        docId: assignment._id,
                        version: assignment.version,
                      }),
                    )
                  }
                >
                  Unassign
                </button>
              </div>
            </li>
          );
        })}
        {eventAssignments.length === 0 ? (
          <li className="px-3 py-3 text-base text-ink-3">
            No staff assigned yet.
          </li>
        ) : null}
      </ul>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Open / claimable shifts</h3>
        <form
          className="grid gap-2 sm:grid-cols-3"
          onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
            formEvent.preventDefault();
            const data = new FormData(formEvent.currentTarget);
            const role = String(data.get("role") ?? "").trim();
            const description = String(data.get("description") ?? "").trim();
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
            <input name="role" className="field-input" required />
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
        <ul className="divide-y divide-line border border-line">
          {eventNeeds.map((need) => (
            <li
              key={need._id}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
            >
              <div>
                <p className="font-medium">{need.role}</p>
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
                          setNeedPersonIds((current) => ({
                            ...current,
                            [need._id]: changeEvent.target.value,
                          }))
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
                              {conflict.approvedOff.length ? " · time off" : ""}
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
                          void run(`claim:${need._id}`, () =>
                            claimNeed({
                              docId: need._id,
                              version: need.version,
                              personId: needPersonIds[need._id]!,
                            }),
                          )
                        }
                      >
                        Hold for them
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy != null || !needPersonIds[need._id]}
                      onClick={() =>
                        void run(`fill:${need._id}`, () =>
                          fillNeed({
                            docId: need._id,
                            version: need.version,
                            personId: needPersonIds[need._id]!,
                          }),
                        )
                      }
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
                    onClick={() => {
                      void (async () => {
                        const reason = await prompt.askReason({
                          title: "Cancel open shift",
                          description:
                            "Record why this open shift is coming down.",
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
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {eventNeeds.length === 0 ? (
            <li className="px-3 py-3 text-base text-ink-3">
              No open shifts posted. Post one so eligible staff can claim it.
            </li>
          ) : null}
        </ul>
      </div>
    </section>
  );
}
