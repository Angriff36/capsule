import { useState, type FormEvent } from "react";
import {
  useAvailabilityWindowWithdraw,
  useCreateAvailabilityWindow,
  useCreateTimeRecord,
  useListAvailabilityWindow,
  useListEvent,
  useListPerson,
  useListShift,
  useListTimeRecord,
  useTimeRecordClockOut,
  useTimeRecordCorrect,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import {
  formatCountNoun,
  formatDate,
  formatTime,
  toDatetimeLocalValue,
} from "../../lib/format";
import { WorkforceFailureBanner } from "./WorkforceFailureBanner";
import { WorkforceLifecyclePolicy } from "./WorkforceLifecyclePolicy";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import { BoundedDateTimeLocalInput } from "../../ui/BoundedDateInputs";
import {
  CLOCK_OUT_PROMPT_FIELDS,
  currentShiftFor,
  persistClockOut,
  persistPrimaryTimeRecord,
  timeRecordLedgerState,
  type TimeRecordLedgerRow,
} from "./timeRecordEntry";

const policy = new WorkforceLifecyclePolicy();

const toEpoch = (value: FormDataEntryValue | null) => {
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) ? time : Number.NaN;
};

type PersonOption = {
  _id: string;
  givenName: string;
  familyName: string;
};

type EventOption = {
  _id: string;
  title?: string | null;
  startsAt?: number | null;
};

export function TimeSheetClockInForm({
  people,
  events,
  busy,
  defaultClockInLocal,
  onSubmit,
}: {
  people: readonly PersonOption[];
  events: readonly EventOption[];
  busy: boolean;
  defaultClockInLocal: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      className="supply-form"
      onSubmit={onSubmit}
      data-testid="clock-in-form"
    >
      <div className="supply-form-heading">
        <div>
          <p className="eyebrow">New time entry</p>
          <h2>Clock in</h2>
        </div>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Clocking…" : "Clock in"}
        </button>
      </div>
      <p className="mt-2 max-w-160 text-ink-2">
        Pick the event this time belongs to. Enter both times to record a
        finished window (for example 5:00–10:00 PM). Leave clock-out empty to
        stamp in now.
      </p>
      <div className="supply-form-grid">
        <label className="field-label">
          Person
          <select name="personId" className="input" required>
            <option value="">Select person</option>
            {people.map((item) => (
              <option key={item._id} value={item._id}>
                {item.givenName} {item.familyName}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Event
          <select name="eventId" className="input" data-testid="clock-in-event">
            <option value="">No event · unassigned</option>
            {events.map((item) => (
              <option key={item._id} value={item._id}>
                {item.title?.trim() || "Untitled event"}
                {item.startsAt ? ` · ${formatDate(item.startsAt)}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Clock in
          <BoundedDateTimeLocalInput
            name="clockInAt"
            className="input"
            defaultValue={defaultClockInLocal}
            data-testid="clock-in-at"
          />
        </label>
        <label className="field-label">
          Clock out
          <BoundedDateTimeLocalInput
            name="clockOutAt"
            className="input"
            data-testid="clock-out-at"
          />
        </label>
        <label className="field-label">
          Notes
          <input name="notes" className="input" />
        </label>
      </div>
    </form>
  );
}

export function TimeSheetRecordState({ row }: { row: TimeRecordLedgerRow }) {
  return <StatusChip status={timeRecordLedgerState(row)} />;
}

export function TimeSheetPage() {
  const records = useListTimeRecord();
  const windows = useListAvailabilityWindow();
  const people = useListPerson();
  const events = useListEvent();
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
  const activeEvents = (events ?? [])
    .filter((event) => event.deletedAt == null)
    .sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));
  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person ? `${person.givenName} ${person.familyName}` : "Unknown";
  };
  const eventTitle = (id: string | null | undefined) => {
    if (id == null || id === "") return "—";
    const event = events?.find((row) => row._id === id);
    return event?.title?.trim() || "Untitled event";
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

  const timeApi = {
    clockIn,
    clockOut,
    correct,
  };

  const submitClockIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("clock-in", async () => {
      const personId = String(data.get("personId"));
      await persistPrimaryTimeRecord(timeApi, {
        personId,
        eventId: String(data.get("eventId") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
        shift: currentShiftFor(personId, shifts),
        clockInAt: data.get("clockInAt"),
        clockOutAt: data.get("clockOutAt"),
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
      if (key === "clockOut") {
        const values = await prompt.askFields({
          title: "Clock out",
          description:
            "Set the clock-out time. Use now or enter the time they actually finished.",
          fields: [
            {
              ...CLOCK_OUT_PROMPT_FIELDS[0],
              defaultValue: toDatetimeLocalValue(Date.now()),
            },
          ],
          confirmLabel: "Clock out",
        });
        if (!values) return;
        await persistClockOut(timeApi, {
          ...args,
          existingClockInAt: Number(row.clockInAt),
          clockOutAt: values.clockOutAt,
        });
      }
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
    records === undefined ||
    windows === undefined ||
    people === undefined ||
    events === undefined;

  return (
    <div className="operations-stage supply-stage">
      {host}
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Staff · Time</p>
          <h1 className="display-title mt-2">Time sheet & availability</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Clock your team in and out, attach the hours to an event, and keep
            everyone&apos;s availability up to date.
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
        <TimeSheetClockInForm
          people={activePeople}
          events={activeEvents}
          busy={busy != null}
          defaultClockInLocal={toDatetimeLocalValue(Date.now())}
          onSubmit={submitClockIn}
        />
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
          <span>{formatCountNoun(activeRecords.length, "record")}</span>
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
                  <th>Event</th>
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
                    <td>{eventTitle(row.eventId)}</td>
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
                      <TimeSheetRecordState row={row} />
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
          <span>{formatCountNoun(activeWindows.length, "window")}</span>
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
