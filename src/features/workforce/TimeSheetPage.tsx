import { useState, type FormEvent } from "react";
import {
  useAvailabilityWindowWithdraw,
  useCreateAvailabilityWindow,
  useCreateTimeRecord,
  useListPerson,
  useTimeRecordApprove,
  useTimeRecordRemove,
  useTimeRecordClockOut,
  useTimeRecordCorrect,
} from "../../lib/manifest-convex-react";
import { TimeAttentionPanel } from "./TimeAttentionPanel";
import {
  HISTORY_PAGE,
  useAvailabilityWindowPages,
  useShiftsByIds,
  useShiftsInWindow,
  useTimeRecordPages,
} from "../../lib/workforceScopedQueries";
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
  BREAK_PROMPT_FIELDS,
  CLOCK_OUT_PROMPT_FIELDS,
  breakMinutesInput,
  currentShiftFor,
  persistClockOut,
  persistPrimaryTimeRecord,
  timeRecordLedgerState,
  type TimeRecordLedgerRow,
} from "./timeRecordEntry";
import { useWorkingEventId } from "../events/workingEvent";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import {
  hoursLabel,
  plannedComparison,
  workedShifts,
  workedWeeks,
} from "../staff/workedShifts";

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
  const workingId = useWorkingEventId();
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
        Pick the event this time belongs to. Enter both times to save a finished
        window (for example 5:00–10:00 PM). Leave clock-out empty to stamp in
        now.
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
          <select
            key={events.length ? "events-ready" : "events-loading"}
            name="eventId"
            className="input"
            defaultValue={workingId ?? ""}
            data-testid="clock-in-event"
          >
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
            naturalDateDirection="any"
            name="clockInAt"
            className="input"
            defaultValue={defaultClockInLocal}
            data-testid="clock-in-at"
          />
        </label>
        <label className="field-label">
          Clock out
          <BoundedDateTimeLocalInput
            naturalDateDirection="any"
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

/** Break column: null / 0 / missing paints an em dash, never "0 min". */
export function timeRecordBreakLabel(breakMinutes: unknown): string {
  const minutes = Number(breakMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return "—";
  return `${minutes} min`;
}

/** Lunch (unpaid) first; paid breaks underneath, since they stay in pay. */
export function TimeSheetBreakCell({
  breakMinutes,
  paidBreakMinutes,
}: {
  breakMinutes?: unknown;
  paidBreakMinutes?: unknown;
}) {
  const paid = Number(paidBreakMinutes);
  return (
    <td className="supply-number" data-label="Lunch (unpaid)">
      {timeRecordBreakLabel(breakMinutes)}
      {Number.isFinite(paid) && paid > 0 ? (
        <small className="block text-ink-3">{paid} min paid breaks</small>
      ) : null}
    </td>
  );
}

/** Approved or waiting, and who changed the entry and why. */
export function TimeSheetReview({
  row,
  personName,
  payroll,
}: {
  row: {
    status?: unknown;
    approvedAt?: number | null;
    correctionReason?: string | null;
    correctedById?: string | null;
  };
  personName: (id: string) => string;
  /** Sent to payroll or not (approved entries only). */
  payroll?: string | null;
}) {
  const finished = ["closed", "corrected"].includes(String(row.status));
  return (
    <>
      {finished ? (
        <small
          className={`block ${row.approvedAt ? "text-ink-3" : "text-warn"}`}
        >
          {row.approvedAt ? "Approved for payroll" : "Waiting for approval"}
        </small>
      ) : null}
      {payroll ? (
        <small className="block text-ink-3" data-testid="payroll-inclusion">
          {payroll}
        </small>
      ) : null}
      {row.correctionReason ? (
        <small className="block text-ink-3">
          Changed
          {row.correctedById
            ? ` by ${personName(row.correctedById)}`
            : ""}: {row.correctionReason}
        </small>
      ) : null}
    </>
  );
}

/** Where the clock-in came from: the phone's time zone and location. */
export function punchEvidenceLabel(row: {
  timeZone?: string | null;
  clockInLatitude?: number | null;
  clockInLongitude?: number | null;
  clockInAccuracyMeters?: number | null;
}): string | null {
  const parts: string[] = [];
  if (row.clockInLatitude != null && row.clockInLongitude != null)
    parts.push(
      `Phone location ${row.clockInLatitude.toFixed(4)}, ${row.clockInLongitude.toFixed(4)}${row.clockInAccuracyMeters != null ? ` (±${Math.round(row.clockInAccuracyMeters)} m)` : ""}`,
    );
  if (row.timeZone) parts.push(row.timeZone.replace(/_/g, " "));
  return parts.length ? parts.join(" · ") : null;
}

/**
 * Where the clock-out came from, and how far it was from the clock-in when
 * both phones gave a location (a long way off is worth a look, not a block).
 */
export function clockOutEvidenceLabel(row: {
  clockInLatitude?: number | null;
  clockInLongitude?: number | null;
  clockOutLatitude?: number | null;
  clockOutLongitude?: number | null;
  clockOutAccuracyMeters?: number | null;
}): string | null {
  if (row.clockOutLatitude == null || row.clockOutLongitude == null)
    return null;
  const label = `Phone location ${row.clockOutLatitude.toFixed(4)}, ${row.clockOutLongitude.toFixed(4)}${row.clockOutAccuracyMeters != null ? ` (±${Math.round(row.clockOutAccuracyMeters)} m)` : ""}`;
  if (row.clockInLatitude == null || row.clockInLongitude == null) return label;
  const km = distanceKm(
    row.clockInLatitude,
    row.clockInLongitude,
    row.clockOutLatitude,
    row.clockOutLongitude,
  );
  return km < 0.5
    ? `${label} · same place as the clock-in`
    : `${label} · ${km.toFixed(1)} km from the clock-in`;
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) *
      Math.cos(lat2 * rad) *
      Math.sin(((lon2 - lon1) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Under the hours: the planned shift and how the recorded time compares. */
export function PlannedVsRecorded({
  row,
  planned,
}: {
  row: {
    clockInAt?: number | null;
    clockOutAt?: number | null;
    breakMinutes?: number | null;
  };
  planned?: { startsAt?: number | null; endsAt?: number | null };
}) {
  if (
    planned?.startsAt == null ||
    planned.endsAt == null ||
    row.clockInAt == null ||
    row.clockOutAt == null ||
    row.clockOutAt < row.clockInAt
  )
    return null;
  const hours = Math.max(
    0,
    (row.clockOutAt - row.clockInAt) / 3_600_000 -
      Math.max(0, row.breakMinutes ?? 0) / 60,
  );
  return (
    <small className="block text-ink-3" data-testid="planned-vs-recorded">
      Planned {formatTime(planned.startsAt)} – {formatTime(planned.endsAt)} ·{" "}
      {plannedComparison({ hours }, planned)}
    </small>
  );
}

export function TimeSheetPage() {
  // Newest entries and windows a page at a time ("Load more" for older).
  const recordPages = useTimeRecordPages();
  const windowPages = useAvailabilityWindowPages();
  const records =
    recordPages.status === "LoadingFirstPage" ? undefined : recordPages.results;
  const windows =
    windowPages.status === "LoadingFirstPage" ? undefined : windowPages.results;
  const people = useListPerson();
  const workingId = useWorkingEventId();
  const events = usePickerAndNamedEvents(
    records ? [workingId, ...records.map((row) => row.eventId)] : undefined,
  );
  // The planned shifts of the entries shown, and today's shifts for a new
  // clock-in.
  const [today] = useState(() => {
    const start = new Date().setHours(0, 0, 0, 0);
    return { from: start, to: new Date(start).setHours(24) };
  });
  const recordShifts = useShiftsByIds(records?.map((row) => row.shiftId));
  const todayShifts = useShiftsInWindow(today);
  const shifts =
    recordShifts && todayShifts ? [...recordShifts, ...todayShifts] : undefined;
  const clockIn = useCreateTimeRecord();
  const clockOut = useTimeRecordClockOut();
  const correct = useTimeRecordCorrect();
  const approve = useTimeRecordApprove();
  const removeRecord = useTimeRecordRemove();
  const declare = useCreateAvailabilityWindow();
  const withdraw = useAvailabilityWindowWithdraw();
  const { prompt, host } = useActionPrompt();
  const [showForm, setShowForm] = useState<"clockIn" | "declare" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const [personFilter, setPersonFilter] = useState("");
  // Newest first; one person's shifts when the filter is set.
  const activeRecords = (records ?? [])
    .filter(
      (row) =>
        row.deletedAt == null &&
        (personFilter === "" || row.personId === personFilter),
    )
    .sort((a, b) => (b.clockInAt ?? 0) - (a.clockInAt ?? 0));
  const filteredWeeks = personFilter
    ? workedWeeks(workedShifts(activeRecords))
    : [];
  const activeWindows = (windows ?? []).filter((row) => row.deletedAt == null);
  const activePeople = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );
  // Hours belong to work already done: today's and past events first,
  // newest first, then what is coming; cancelled events stay out.
  const cutoff = Date.now() + 86_400_000;
  const activeEvents = (events ?? [])
    .filter((event) => event.deletedAt == null && event.stage !== "cancelled")
    .sort((a, b) => {
      const aStart = a.startsAt ?? 0;
      const bStart = b.startsAt ?? 0;
      const aDone = aStart <= cutoff;
      const bDone = bStart <= cutoff;
      if (aDone !== bDone) return aDone ? -1 : 1;
      return aDone ? bStart - aStart : aStart - bStart;
    });
  const personName = (id: string) => {
    const person = people?.find((row) => row._id === id);
    return person
      ? `${person.givenName} ${person.familyName ?? ""}`.trim()
      : "Unknown";
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
      // Match the shift at the typed clock-in time, not the moment of saving.
      const typedIn = toEpoch(data.get("clockInAt"));
      await persistPrimaryTimeRecord(timeApi, {
        personId,
        eventId: String(data.get("eventId") || "") || undefined,
        notes: String(data.get("notes") || "") || undefined,
        shift: currentShiftFor(
          personId,
          shifts,
          Number.isFinite(typedIn) ? typedIn : Date.now(),
        ),
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
            ...BREAK_PROMPT_FIELDS,
          ],
          confirmLabel: "Clock out",
        });
        if (!values) return;
        await persistClockOut(timeApi, {
          ...args,
          existingClockInAt: Number(row.clockInAt),
          clockOutAt: values.clockOutAt,
          breakMinutes: breakMinutesInput(values.breakMinutes),
          paidBreakMinutes: breakMinutesInput(values.paidBreakMinutes),
        });
      }
      if (key === "correct") {
        const values = await prompt.askFields({
          title: "Correct this time entry",
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
            {
              ...BREAK_PROMPT_FIELDS[0],
              defaultValue: String(row.breakMinutes ?? 0),
            },
            {
              ...BREAK_PROMPT_FIELDS[1],
              defaultValue: String(row.paidBreakMinutes ?? 0),
            },
            {
              name: "reason",
              label: "Why is it changing?",
              placeholder: "For example: forgot to clock out after load-out",
              required: true,
            },
          ],
          confirmLabel: "Save correction",
        });
        if (!values) return;
        const clockInAt = new Date(String(values.clockInAt)).getTime();
        const clockOutAt = new Date(String(values.clockOutAt)).getTime();
        if (!Number.isFinite(clockInAt) || !Number.isFinite(clockOutAt)) return;
        await correct({
          ...args,
          clockInAt,
          clockOutAt,
          reason: String(values.reason ?? "").trim(),
          breakMinutes: breakMinutesInput(values.breakMinutes),
          paidBreakMinutes: breakMinutesInput(values.paidBreakMinutes),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        });
      }
      if (key === "approve") await approve(args);
      if (key === "remove") {
        const values = await prompt.askFields({
          title: "Remove this time entry",
          description: "Take a wrong entry off the time sheet. It is not paid.",
          fields: [
            {
              name: "reason",
              label: "Why",
              inputType: "text",
              required: true,
            },
          ],
          confirmLabel: "Remove entry",
        });
        if (!values) return;
        await removeRecord({
          ...args,
          reason: String(values.reason ?? "").trim(),
        });
      }
    });
  };

  const waitingApproval = activeRecords.filter(
    (row) =>
      ["closed", "corrected"].includes(String(row.status)) &&
      row.clockOutAt != null &&
      row.approvedAt == null,
  );
  const approveAll = () => {
    void run("approve-all", async () => {
      for (const row of waitingApproval)
        await approve({ docId: row._id, version: row.version });
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
      <TimeAttentionPanel shifts={shifts} onFailure={setFailure} />

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
            <h2>Time entries</h2>
          </div>
          <span className="flex flex-wrap items-center gap-3">
            <select
              className="input"
              aria-label="Show one person's time entries"
              value={personFilter}
              onChange={(event) => setPersonFilter(event.target.value)}
              data-testid="time-entries-person-filter"
            >
              <option value="">Everyone</option>
              {(people ?? [])
                .filter((person) => person.deletedAt == null)
                .sort((a, b) =>
                  `${a.givenName} ${a.familyName}`.localeCompare(
                    `${b.givenName} ${b.familyName}`,
                  ),
                )
                .map((person) => (
                  <option key={person._id} value={person._id}>
                    {person.givenName} {person.familyName}
                  </option>
                ))}
            </select>
            {formatCountNoun(
              activeRecords.length,
              "time entry",
              "time entries",
            )}
            {waitingApproval.length > 0 ? (
              <button
                className="btn btn-primary btn-sm"
                disabled={busy != null}
                onClick={approveAll}
                data-testid="approve-all-time"
              >
                {busy === "approve-all"
                  ? "Approving…"
                  : `Approve ${formatCountNoun(waitingApproval.length, "finished entry", "finished entries")}`}
              </button>
            ) : null}
          </span>
        </div>
        {personFilter && filteredWeeks.length > 0 ? (
          <p
            className="px-1 py-2 text-sm text-ink-2"
            data-testid="time-entries-person-summary"
          >
            {personName(personFilter)}:{" "}
            {filteredWeeks
              .slice(0, 4)
              .map(
                (week) =>
                  `week of ${formatDate(week.weekStart)} ${hoursLabel(week.hours)}`,
              )
              .join(" · ")}
          </p>
        ) : null}
        {loading ? (
          <TableSkeleton rows={5} />
        ) : activeRecords.length === 0 ? (
          <div className="document-empty">
            <p>No time has been recorded.</p>
            <span>Clock someone in to start their first time entry.</span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table phone-cards">
              <thead>
                <tr>
                  <th>Person</th>
                  <th>Event</th>
                  <th>Clock in</th>
                  <th>Clock out</th>
                  <th>Lunch (unpaid)</th>
                  <th>Hours</th>
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
                    <td data-label="Event">{eventTitle(row.eventId)}</td>
                    <td data-label="Clock in">
                      {row.clockInAt
                        ? `${formatDate(row.clockInAt)} ${formatTime(row.clockInAt)}`
                        : "—"}
                      {punchEvidenceLabel(row) ? (
                        <small
                          className="block text-ink-3"
                          data-testid="punch-evidence"
                        >
                          {punchEvidenceLabel(row)}
                        </small>
                      ) : null}
                    </td>
                    <td data-label="Clock out">
                      {row.clockOutAt
                        ? `${formatDate(row.clockOutAt)} ${formatTime(row.clockOutAt)}`
                        : "—"}
                      {clockOutEvidenceLabel(row) ? (
                        <small
                          className="block text-ink-3"
                          data-testid="clock-out-evidence"
                        >
                          {clockOutEvidenceLabel(row)}
                        </small>
                      ) : null}
                    </td>
                    <TimeSheetBreakCell
                      breakMinutes={row.breakMinutes}
                      paidBreakMinutes={row.paidBreakMinutes}
                    />
                    <td data-label="Hours">
                      {row.clockInAt != null &&
                      row.clockOutAt != null &&
                      row.clockOutAt >= row.clockInAt
                        ? hoursLabel(
                            Math.max(
                              0,
                              (row.clockOutAt - row.clockInAt) / 3_600_000 -
                                (row.breakMinutes ?? 0) / 60,
                            ),
                          )
                        : "—"}
                      <PlannedVsRecorded
                        row={row}
                        planned={
                          row.shiftId
                            ? (shifts ?? []).find(
                                (shift) => shift._id === row.shiftId,
                              )
                            : undefined
                        }
                      />
                    </td>
                    <td>
                      <TimeSheetRecordState row={row} />
                      <TimeSheetReview row={row} personName={personName} />
                    </td>
                    <td>
                      <div className="supply-row-actions">
                        {[
                          ...policy.timeActions(String(row.status)),
                          ...(waitingApproval.includes(row)
                            ? [{ key: "approve", label: "Approve" }]
                            : []),
                          ...(row.approvedAt == null
                            ? [{ key: "remove", label: "Remove" }]
                            : []),
                        ].map((action) => (
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
        {recordPages.status === "CanLoadMore" ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            onClick={() => recordPages.loadMore(HISTORY_PAGE)}
          >
            Load more
          </button>
        ) : null}
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
        {windowPages.status === "CanLoadMore" ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-3"
            onClick={() => windowPages.loadMore(HISTORY_PAGE)}
          >
            Load more
          </button>
        ) : null}
      </section>
    </div>
  );
}
