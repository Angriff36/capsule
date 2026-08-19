import { useState, type FormEvent } from "react";
import {
  useAvailabilityWindowWithdraw,
  useCreateAvailabilityWindow,
  useCreateTimeRecord,
  useListAvailabilityWindow,
  useListPerson,
  useListShift,
  useListTimeRecord,
  useTimeRecordClockOut,
  useTimeRecordCorrect,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { formatDate, formatTime, toDatetimeLocalValue } from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceLifecyclePolicy } from "./WorkforceLifecyclePolicy";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";

const policy = new WorkforceLifecyclePolicy();

const toEpoch = (value: FormDataEntryValue | null) => {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

export function TimeSheetPage() {
  const records = useListTimeRecord();
  const windows = useListAvailabilityWindow();
  const people = useListPerson();
  const shifts = useListShift();
  const clockIn = useCreateTimeRecord();
  const clockOut = useTimeRecordClockOut();
  const correct = useTimeRecordCorrect();
  const declare = useCreateAvailabilityWindow();
  const withdraw = useAvailabilityWindowWithdraw();
  const { prompt, host } = useActionPrompt();
  const [showForm, setShowForm] = useState<"clockIn" | "declare" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const activeRecords = (records ?? []).filter((row) => row.deletedAt == null);
  const activeWindows = (windows ?? []).filter((row) => row.deletedAt == null);
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
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

  // Attach the clock-in to the person's current shift (and its event) so
  // worked time is event-attributable — closeout labor and event margin
  // read clocked time by event.
  const currentShiftFor = (personId: string) => {
    const now = Date.now();
    const slack = 2 * 60 * 60 * 1000;
    return (shifts ?? [])
      .filter(
        (shift) =>
          shift.deletedAt == null &&
          String(shift.personId) === personId &&
          ["scheduled", "started"].includes(String(shift.status)),
      )
      .sort((a, b) => (a.startsAt ?? 0) - (b.startsAt ?? 0))
      .find(
        (shift) =>
          shift.startsAt != null &&
          shift.endsAt != null &&
          now >= shift.startsAt - slack &&
          now <= shift.endsAt + slack,
      );
  };

  const submitClockIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("clock-in", async () => {
      const personId = String(data.get("personId"));
      const shift = currentShiftFor(personId);
      await clockIn({
        personId,
        ...(shift
          ? {
              shiftId: shift._id,
              ...(shift.eventId ? { eventId: shift.eventId } : {}),
            }
          : {}),
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setShowForm(null);
    });
  };

  const submitDeclare = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("declare", async () => {
      await declare({
        personId: String(data.get("personId")),
        startsAt: toEpoch(data.get("startsAt")),
        endsAt: toEpoch(data.get("endsAt")),
        kind: String(data.get("kind") || "available"),
        notes: String(data.get("notes") || "") || undefined,
      });
      form.reset();
      setShowForm(null);
    });
  };

  const invokeTime = (row: any, key: string) => {
    void run(`${row._id}:${key}`, async () => {
      const args = { docId: row._id, version: row.version };
      if (key === "clockOut") await clockOut(args);
      if (key === "correct") {
        const values = await prompt.askFields({
          title: "Correct this time record",
          description: "Set the right clock-in and clock-out times.",
          fields: [
            {
              name: "clockInAt",
              label: "Clock in",
              inputType: "datetime-local",
              defaultValue: row.clockInAt
                ? toDatetimeLocalValue(Number(row.clockInAt))
                : undefined,
              required: true,
            },
            {
              name: "clockOutAt",
              label: "Clock out",
              inputType: "datetime-local",
              defaultValue: row.clockOutAt
                ? toDatetimeLocalValue(Number(row.clockOutAt))
                : undefined,
              required: true,
            },
          ],
          confirmLabel: "Save correction",
        });
        if (!values) return;
        const clockInAt = new Date(String(values.clockInAt)).getTime();
        const clockOutAt = new Date(String(values.clockOutAt)).getTime();
        if (!Number.isFinite(clockInAt) || !Number.isFinite(clockOutAt)) return;
        await correct({ ...args, clockInAt, clockOutAt });
      }
    });
  };

  const withdrawWindow = (row: any) => {
    void run(`${row._id}:withdraw`, async () => {
      await withdraw({ docId: row._id, version: row.version });
    });
  };

  const loading =
    records === undefined || windows === undefined || people === undefined;

  return (
    <div className="operations-stage supply-stage">
      {host}
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Time</p>
          <h1 className="display-title mt-2">Time sheet & availability</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Clock your team in and out, fix mistakes with a note about why, and
            keep everyone's availability up to date.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-primary"
            onClick={() =>
              setShowForm((value) => (value === "clockIn" ? null : "clockIn"))
            }
          >
            {showForm === "clockIn" ? "Close form" : "Clock in"}
          </button>
          <button
            className="btn btn-primary"
            onClick={() =>
              setShowForm((value) => (value === "declare" ? null : "declare"))
            }
          >
            {showForm === "declare" ? "Close form" : "Declare availability"}
          </button>
        </div>
      </header>
      <WorkforceWorkspaceNav />
      {failure ? <WorkforceFailureBanner error={failure} /> : null}

      {showForm === "clockIn" ? (
        <form className="supply-form" onSubmit={submitClockIn}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New time entry</p>
              <h2>Clock in</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "clock-in" ? "Clocking…" : "Clock in"}
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
              Notes
              <input name="notes" className="input" />
            </label>
          </div>
        </form>
      ) : null}

      {showForm === "declare" ? (
        <form className="supply-form" onSubmit={submitDeclare}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">New availability window</p>
              <h2>Declare availability</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "declare" ? "Declaring…" : "Declare"}
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
              Type
              <select name="kind" className="input">
                <option value="available">Available to work</option>
                <option value="unavailable">Time off</option>
              </select>
            </label>
            <label className="field-label">
              From
              <BoundedDateTimeLocalInput
                name="startsAt"
                className="input"
                required
              />
            </label>
            <label className="field-label">
              Until
              <BoundedDateTimeLocalInput
                name="endsAt"
                className="input"
                required
              />
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
            <p className="eyebrow">Attendance</p>
            <h2>Time records</h2>
          </div>
          <span>{activeRecords.length} records</span>
        </div>
        {loading ? (
          <TableSkeleton rows={5} />
        ) : activeRecords.length === 0 ? (
          <div className="document-empty">
            <p>No time has been recorded.</p>
            <span>Clock someone in to start their first time entry.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Break</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeRecords.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(row.personId)}</strong>
                    </td>
                    <td>
                      {row.clockInAt
                        ? `${formatDate(row.clockInAt)} ${formatTime(row.clockInAt)}`
                        : "—"}
                    </td>
                    <td>
                      {row.clockOutAt
                        ? `${formatDate(row.clockOutAt)} ${formatTime(row.clockOutAt)}`
                        : "—"}
                    </td>
                    <td className="supply-number">
                      {row.breakMinutes ?? 0} min
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                      {row.correctedAt ? <small>corrected</small> : null}
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .timeActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => invokeTime(row, action.key)}
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
            <p className="eyebrow">Availability</p>
            <h2>Availability windows</h2>
          </div>
          <span>{activeWindows.length} windows</span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : activeWindows.length === 0 ? (
          <div className="document-empty">
            <p>No availability is declared.</p>
            <span>Declare a window with a start and end time.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Window</th>
                  <th>State</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {activeWindows.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{personName(row.personId)}</strong>
                    </td>
                    <td>
                      {row.startsAt
                        ? `${formatDate(row.startsAt)} ${formatTime(row.startsAt)}`
                        : "—"}{" "}
                      →{" "}
                      {row.endsAt
                        ? `${formatDate(row.endsAt)} ${formatTime(row.endsAt)}`
                        : "—"}
                      {row.kind === "unavailable" ? (
                        <small className="text-danger"> · time off</small>
                      ) : null}
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {policy
                          .availabilityActions(String(row.status))
                          .map((action) => (
                            <button
                              key={action.key}
                              className="btn btn-ghost btn-sm"
                              disabled={busy != null}
                              onClick={() => withdrawWindow(row)}
                            >
                              {busy === `${row._id}:withdraw`
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
