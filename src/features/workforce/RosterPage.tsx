import { useState, type FormEvent } from "react";
import {
  useCreateEventAssignment,
  useCreateShift,
  useEventAssignmentCheckIn,
  useEventAssignmentCheckOut,
  useEventAssignmentConfirm,
  useEventAssignmentMarkNoShow,
  useEventAssignmentUnassign,
  useListEvent,
  useListEventAssignment,
  useListPerson,
  useListShift,
  useShiftCancel,
  useShiftComplete,
  useShiftMarkNoShow,
  useShiftStart,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceLifecyclePolicy } from "./WorkforceLifecyclePolicy";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";

const policy = new WorkforceLifecyclePolicy();

const toEpoch = (value: FormDataEntryValue | null) => {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

export function RosterPage() {
  const assignments = useListEventAssignment();
  const shifts = useListShift();
  const events = useListEvent();
  const people = useListPerson();
  const createAssignment = useCreateEventAssignment();
  const confirm = useEventAssignmentConfirm();
  const checkIn = useEventAssignmentCheckIn();
  const checkOut = useEventAssignmentCheckOut();
  const assignmentNoShow = useEventAssignmentMarkNoShow();
  const unassign = useEventAssignmentUnassign();
  const createShift = useCreateShift();
  const startShift = useShiftStart();
  const completeShift = useShiftComplete();
  const cancelShift = useShiftCancel();
  const shiftNoShow = useShiftMarkNoShow();
  const [showForm, setShowForm] = useState<"assignment" | "shift" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const activeAssignments = (assignments ?? []).filter(
    (row) => row.deletedAt == null,
  );
  const activeShifts = (shifts ?? []).filter((row) => row.deletedAt == null);
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  const eventName = (id: string | undefined) =>
    events?.find((event) => event._id === id)?.title ?? "—";
  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submitAssignment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const startsAt = data.get("startsAt")
      ? toEpoch(data.get("startsAt"))
      : undefined;
    const endsAt = data.get("endsAt") ? toEpoch(data.get("endsAt")) : undefined;
    void run("create-assignment", async () => {
      await createAssignment({
        eventId: String(data.get("eventId")),
        personId: String(data.get("personId")),
        role: String(data.get("role")),
        startsAt,
        endsAt,
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setShowForm(null);
    });
  };

  const submitShift = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("create-shift", async () => {
      await createShift({
        personId: String(data.get("personId")),
        startsAt: toEpoch(data.get("startsAt")),
        endsAt: toEpoch(data.get("endsAt")),
        eventId: String(data.get("eventId") || "") || undefined,
        role: String(data.get("role") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setShowForm(null);
    });
  };

  const invokeAssignment = (row: any, key: string) => {
    void run(`${row._id}:${key}`, async () => {
      const args = { docId: row._id, version: row.version };
      if (key === "confirm") await confirm(args);
      if (key === "checkIn") await checkIn(args);
      if (key === "checkOut") await checkOut(args);
      if (key === "markNoShow") await assignmentNoShow(args);
      if (key === "unassign") await unassign(args);
    });
  };

  const invokeShift = (row: any, key: string) => {
    void run(`${row._id}:${key}`, async () => {
      const args = { docId: row._id, version: row.version };
      if (key === "start") await startShift(args);
      if (key === "complete") await completeShift(args);
      if (key === "markNoShow") await shiftNoShow(args);
      if (key === "cancel") {
        const reason = window.prompt("Cancellation reason")?.trim();
        if (!reason) return;
        await cancelShift({ ...args, reason });
      }
    });
  };

  const loading =
    assignments === undefined ||
    shifts === undefined ||
    events === undefined ||
    people === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Roster</p>
          <h1 className="display-title mt-2">Event staffing roster</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Assign people to events and schedule shifts. Staff confirm, check in
            and out of their own work; managers control the rest.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-primary"
            onClick={() =>
              setShowForm((value) =>
                value === "assignment" ? null : "assignment",
              )
            }
          >
            {showForm === "assignment" ? "Close form" : "Assign to event"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              setShowForm((value) => (value === "shift" ? null : "shift"))
            }
          >
            {showForm === "shift" ? "Close form" : "Schedule shift"}
          </button>
        </div>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {showForm === "assignment" ? (
        <form className="supply-form" onSubmit={submitAssignment}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New governed assignment</p>
              <h2>Assign a person to an event</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-assignment" ? "Assigning…" : "Assign"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Event
              <select name="eventId" className="input" required>
                <option value="">Select event</option>
                {(events ?? [])
                  .filter((item) => item.deletedAt == null)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Person
              <select name="personId" className="input" required>
                <option value="">Select person</option>
                {activePeople.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.givenName} {item.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Role
              <input
                name="role"
                className="input"
                placeholder="server"
                required
              />
            </label>
            <label className="field-label">
              Starts
              <input name="startsAt" className="input" type="datetime-local" />
            </label>
            <label className="field-label">
              Ends
              <input name="endsAt" className="input" type="datetime-local" />
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      {showForm === "shift" ? (
        <form className="supply-form" onSubmit={submitShift}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New governed shift</p>
              <h2>Schedule a shift</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-shift" ? "Scheduling…" : "Schedule"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label">
              Person
              <select name="personId" className="input" required>
                <option value="">Select person</option>
                {activePeople.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.givenName} {item.familyName}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Starts
              <input
                name="startsAt"
                className="input"
                type="datetime-local"
                required
              />
            </label>
            <label className="field-label">
              Ends
              <input
                name="endsAt"
                className="input"
                type="datetime-local"
                required
              />
            </label>
            <label className="field-label">
              Event (optional)
              <select name="eventId" className="input">
                <option value="">No event</option>
                {(events ?? [])
                  .filter((item) => item.deletedAt == null)
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field-label">
              Role
              <input name="role" className="input" placeholder="captain" />
            </label>
            <label className="field-label">
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Coverage</p>
            <h2>Event assignments</h2>
          </div>
          <span>{activeAssignments.length} assignments</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : activeAssignments.length === 0 ? (
          <div className="document-empty">
            <p>No one is assigned to an event.</p>
            <span>Assign an active person to an event with a role.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Person</th>
                  <th>Role</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeAssignments.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{eventName(row.eventId)}</strong>
                    </td>
                    <td>{personName(row.personId)}</td>
                    <td>{row.role || "—"}</td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .assignmentActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invokeAssignment(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Schedule</p>
            <h2>Shifts</h2>
          </div>
          <span>{activeShifts.length} shifts</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : activeShifts.length === 0 ? (
          <div className="document-empty">
            <p>No shifts are scheduled.</p>
            <span>Schedule a shift with a start and end time.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Event</th>
                  <th>Window</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeShifts.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(row.personId)}</strong>
                      <small>{row.role || ""}</small>
                    </td>
                    <td>{eventName(row.eventId)}</td>
                    <td>
                      {row.startsAt
                        ? new Date(row.startsAt).toLocaleString()
                        : "—"}{" "}
                      →{" "}
                      {row.endsAt ? new Date(row.endsAt).toLocaleString() : "—"}
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                      {row.cancellationReason ? (
                        <small>{row.cancellationReason}</small>
                      ) : null}
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .shiftActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invokeShift(row, action.key)}
                            >
                              {busy === `${row._id}:${action.key}`
                                ? "Working…"
                                : action.label}
                            </button>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
