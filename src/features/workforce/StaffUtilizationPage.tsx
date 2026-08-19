import { useEffect, useMemo, useState } from "react";
import {
  useListEvent,
  useListPerson,
  useListShift,
  useListTimeRecord,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import {
  buildStaffUtilizationReport,
  DEFAULT_WEEKLY_SCHEDULE_TARGET_HOURS,
  type StaffingDemandBucket,
  type StaffUtilizationEvent,
  type StaffUtilizationPerson,
  type StaffUtilizationShift,
  type StaffUtilizationTimeRecord,
} from "./staffUtilization";
import { WorkforceWorkspaceNav } from "./WorkforceWorkspaceNav";
import "./StaffUtilizationPage.css";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

const TARGET_STORAGE_KEY =
  "capsule.workforce.utilization-schedule-target-hours";

const hours = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const percent = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const dateRange = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

type DemandView = "weekday" | "event_type";
type PeriodPreset = "week" | "month" | "90_days" | "custom";

function dateInputValue(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? Number.NaN : date.getTime();
}

function endOfLocalDateExclusive(value: string): number {
  const start = startOfLocalDay(value);
  if (!Number.isFinite(start)) return Number.NaN;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return end.getTime();
}

function presetRange(
  preset: Exclude<PeriodPreset, "custom">,
  now: Date,
): { startDate: string; endDate: string } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(end);
  if (preset === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  } else if (preset === "month") {
    start.setDate(1);
  } else {
    start.setDate(start.getDate() - 89);
  }
  return { startDate: dateInputValue(start), endDate: dateInputValue(end) };
}

function initialTarget(): number {
  if (typeof window === "undefined") {
    return DEFAULT_WEEKLY_SCHEDULE_TARGET_HOURS;
  }
  try {
    const stored = Number(window.localStorage.getItem(TARGET_STORAGE_KEY));
    return Number.isFinite(stored) && stored >= 0 && stored <= 168
      ? stored
      : DEFAULT_WEEKLY_SCHEDULE_TARGET_HOURS;
  } catch {
    return DEFAULT_WEEKLY_SCHEDULE_TARGET_HOURS;
  }
}

function formatHours(value: number): string {
  return `${hours.format(value)}h`;
}

function DemandBars({ buckets }: { buckets: readonly StaffingDemandBucket[] }) {
  const maxHours = Math.max(0, ...buckets.map((bucket) => bucket.hours));
  if (maxHours === 0) {
    return (
      <div className="document-empty">
        <p>No committed shift demand in this period.</p>
        <span>Schedule shifts to see the staffing pattern here.</span>
      </div>
    );
  }

  return (
    <div className="utilization-demand-bars">
      {buckets.map((bucket) => (
        <div
          className="utilization-demand-row"
          key={bucket.key}
          data-testid={`demand-${bucket.key}`}
        >
          <div className="utilization-demand-label">
            <strong>{bucket.label}</strong>
            <small>
              {bucket.shiftCount} {bucket.shiftCount === 1 ? "shift" : "shifts"}
            </small>
          </div>
          <div className="utilization-demand-track" aria-hidden="true">
            <i style={{ width: `${(bucket.hours / maxHours) * 100}%` }} />
          </div>
          <div className="utilization-demand-value">
            <strong>{formatHours(bucket.hours)}</strong>
            <small>{percent.format(bucket.sharePercent)}%</small>
          </div>
        </div>
      ))}
    </div>
  );
}

export function StaffUtilizationDashboard({
  people,
  shifts,
  timeRecords,
  events,
  loading = false,
  now = new Date(),
}: {
  people: readonly StaffUtilizationPerson[];
  shifts: readonly StaffUtilizationShift[];
  timeRecords: readonly StaffUtilizationTimeRecord[];
  events: readonly StaffUtilizationEvent[];
  loading?: boolean;
  now?: Date;
}) {
  const initialRange = useMemo(() => presetRange("month", now), [now]);
  const [preset, setPreset] = useState<PeriodPreset>("month");
  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [weeklyTargetHours, setWeeklyTargetHours] = useState(initialTarget);
  const [demandView, setDemandView] = useState<DemandView>("weekday");

  useEffect(() => {
    try {
      window.localStorage.setItem(
        TARGET_STORAGE_KEY,
        String(weeklyTargetHours),
      );
    } catch {
      // Storage can be unavailable in locked-down browser contexts.
    }
  }, [weeklyTargetHours]);

  const startAt = startOfLocalDay(startDate);
  const endAt = endOfLocalDateExclusive(endDate);
  const rangeIsValid =
    Number.isFinite(startAt) && Number.isFinite(endAt) && endAt > startAt;
  const report = useMemo(
    () =>
      buildStaffUtilizationReport({
        people,
        shifts,
        timeRecords,
        events,
        startAt,
        endAt,
        weeklyScheduleTargetHours: weeklyTargetHours,
      }),
    [endAt, events, people, shifts, startAt, timeRecords, weeklyTargetHours],
  );
  const activeDemand =
    demandView === "weekday"
      ? report.demandByWeekday
      : report.demandByEventType;
  const peakDemand =
    demandView === "weekday" ? report.peakWeekday : report.peakEventType;
  const underScheduled = report.rows.filter((row) => row.underScheduled);
  const displayedRangeEnd = new Date(report.endAt);
  displayedRangeEnd.setMilliseconds(-1);

  const choosePreset = (nextPreset: Exclude<PeriodPreset, "custom">) => {
    const range = presetRange(nextPreset, now);
    setPreset(nextPreset);
    setStartDate(range.startDate);
    setEndDate(range.endDate);
  };

  return (
    <div className="operations-stage supply-stage staff-utilization-stage">
      <header className="supply-masthead staff-utilization-masthead">
        <div>
          <p className="eyebrow">Staff · Capacity intelligence</p>
          <h1 className="display-title mt-2">Hours with a pulse.</h1>
          <p className="mt-3 max-w-180 text-ink-2">
            Compare committed shifts with confirmed work, see how much time was
            event-billable, and spot thin schedules before service gets busy.
          </p>
        </div>
        <div className="staff-utilization-range" aria-label="Displayed period">
          <span>Reporting period</span>
          <strong>
            {rangeIsValid
              ? `${dateRange.format(report.startAt)} — ${dateRange.format(displayedRangeEnd)}`
              : "Choose a valid range"}
          </strong>
          <small>{report.calendarDays} calendar days</small>
        </div>
      </header>
      <WorkforceWorkspaceNav />

      <section
        className="staff-utilization-controls"
        aria-label="Report controls"
      >
        <div>
          <span className="eyebrow">Period</span>
          <div className="staff-utilization-switch">
            {(
              [
                ["week", "This week"],
                ["month", "This month"],
                ["90_days", "Last 90 days"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={preset === value}
                onClick={() => choosePreset(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="staff-utilization-dates">
          <label className="field-label">
            From
            <BoundedDateInput
              className="input"
              value={startDate}
              max={endDate}
              onChange={(event) => {
                setPreset("custom");
                setStartDate(event.target.value);
              }}
            />
          </label>
          <label className="field-label">
            Through
            <BoundedDateInput
              className="input"
              value={endDate}
              min={startDate}
              onChange={(event) => {
                setPreset("custom");
                setEndDate(event.target.value);
              }}
            />
          </label>
        </div>
        <label className="staff-utilization-target">
          <span>Weekly schedule target</span>
          <span className="staff-utilization-target-input">
            <input
              type="number"
              min="0"
              max="168"
              step="1"
              value={weeklyTargetHours}
              data-testid="weekly-schedule-target"
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 0 && next <= 168) {
                  setWeeklyTargetHours(next);
                }
              }}
            />
            <b>h</b>
          </span>
          <small>Saved in this browser · prorated for the period</small>
        </label>
      </section>

      {!rangeIsValid ? (
        <div className="staff-utilization-range-error" role="alert">
          The reporting end date must be on or after the start date.
        </div>
      ) : loading ? (
        <section className="staff-utilization-panel">
          <TableSkeleton rows={8} />
        </section>
      ) : (
        <>
          <section
            className="staff-utilization-scorecard"
            aria-label="Utilization summary"
          >
            <div data-testid="summary-utilization">
              <span>Billable utilization</span>
              <strong>
                {report.utilizationPercent == null
                  ? "—"
                  : `${percent.format(report.utilizationPercent)}%`}
              </strong>
              <small>event-linked ÷ confirmed hours</small>
            </div>
            <div data-testid="summary-billable-hours">
              <span>Billable hours</span>
              <strong>{formatHours(report.billableHours)}</strong>
              <small>confirmed time linked to events</small>
            </div>
            <div data-testid="summary-total-hours">
              <span>Total hours</span>
              <strong>{formatHours(report.totalHours)}</strong>
              <small>
                {report.confirmedRecordCount} confirmed time records
              </small>
            </div>
            <div
              className={
                report.underScheduledCount > 0 ? "is-under" : undefined
              }
              data-testid="summary-under-scheduled"
            >
              <span>Under scheduled</span>
              <strong>{report.underScheduledCount}</strong>
              <small>
                below {formatHours(report.targetHoursPerPerson)} this period
              </small>
            </div>
          </section>

          {underScheduled.length > 0 ? (
            <aside
              className="staff-utilization-attention"
              data-testid="under-scheduled-callout"
            >
              <span className="eyebrow">Needs a scheduling look</span>
              <p>
                <strong>
                  {underScheduled
                    .slice(0, 4)
                    .map((row) => row.personName)
                    .join(", ")}
                  {underScheduled.length > 4
                    ? ` +${underScheduled.length - 4} more`
                    : ""}
                </strong>{" "}
                {underScheduled.length === 1 ? "is" : "are"} below the current
                planning target. This is a signal, not a scheduling block.
              </p>
            </aside>
          ) : null}

          <section className="staff-utilization-panel">
            <div className="staff-utilization-panel-heading">
              <div>
                <p className="eyebrow">Per staff member</p>
                <h2>Scheduled work vs. confirmed time</h2>
              </div>
              <span>{report.rows.length} people in view</span>
            </div>
            {report.rows.length === 0 ? (
              <div className="document-empty">
                <p>No staff or time activity in this period.</p>
                <span>
                  Active staff appear here even before a shift is assigned.
                </span>
              </div>
            ) : (
              <div className="supply-table-wrap">
                <table className="supply-table staff-utilization-table">
                  <thead>
                    <tr>
                      <th>Staff member</th>
                      <th>Scheduled</th>
                      <th>Billable</th>
                      <th>Total</th>
                      <th>Utilization</th>
                      <th>Schedule signal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr
                        key={row.personId}
                        className={row.underScheduled ? "is-under" : undefined}
                        data-testid={`staff-utilization-row-${row.personId}`}
                      >
                        <td>
                          <strong>{row.personName}</strong>
                          <small>
                            {row.shiftCount} committed shifts ·{" "}
                            {row.confirmedRecordCount} confirmed records
                          </small>
                        </td>
                        <td>{formatHours(row.scheduledHours)}</td>
                        <td>{formatHours(row.billableHours)}</td>
                        <td>{formatHours(row.totalHours)}</td>
                        <td>
                          <strong className="staff-utilization-percent">
                            {row.utilizationPercent == null
                              ? "—"
                              : `${percent.format(row.utilizationPercent)}%`}
                          </strong>
                          <span
                            className="staff-utilization-meter"
                            aria-hidden="true"
                          >
                            <i
                              style={{
                                width: `${Math.min(100, row.utilizationPercent ?? 0)}%`,
                              }}
                            />
                          </span>
                        </td>
                        <td>
                          {row.underScheduled ? (
                            <span className="staff-utilization-status is-under">
                              {formatHours(row.scheduleGapHours)} below target
                            </span>
                          ) : row.activeForScheduling ? (
                            <span className="staff-utilization-status is-ready">
                              Target covered
                            </span>
                          ) : (
                            <span className="staff-utilization-status">
                              Historical activity
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="staff-utilization-panel staff-demand-panel">
            <div className="staff-utilization-panel-heading">
              <div>
                <p className="eyebrow">Committed shift demand</p>
                <h2>Where the schedule gets heavy</h2>
              </div>
              <div
                className="staff-utilization-switch"
                aria-label="Demand grouping"
              >
                <button
                  type="button"
                  aria-pressed={demandView === "weekday"}
                  onClick={() => setDemandView("weekday")}
                >
                  Day of week
                </button>
                <button
                  type="button"
                  aria-pressed={demandView === "event_type"}
                  onClick={() => setDemandView("event_type")}
                >
                  Event type
                </button>
              </div>
            </div>
            <div className="staff-demand-layout">
              <div className="staff-demand-peak" data-testid="peak-demand">
                <span>Peak demand</span>
                <strong>{peakDemand?.label ?? "—"}</strong>
                <small>
                  {peakDemand
                    ? `${formatHours(peakDemand.hours)} · ${peakDemand.shiftCount} ${peakDemand.shiftCount === 1 ? "shift" : "shifts"}`
                    : "No committed shifts"}
                </small>
                <b>{formatHours(report.scheduledHours)} scheduled in total</b>
              </div>
              <DemandBars buckets={activeDemand} />
            </div>
          </section>
        </>
      )}

      <aside className="staff-utilization-method">
        <span className="eyebrow">Method</span>
        <p>
          Confirmed hours use closed or corrected time records wholly inside the
          selected dates, less recorded breaks. Event-linked time is billable; a
          linked shift can supply the event. Scheduled demand uses scheduled,
          started, and completed shifts, clips them to the period, and excludes
          cancelled or no-show shifts. The under-scheduling target is a visible
          browser preference and never blocks scheduling.
        </p>
      </aside>
    </div>
  );
}

export function StaffUtilizationPage() {
  const people = useListPerson();
  const shifts = useListShift();
  const timeRecords = useListTimeRecord();
  const events = useListEvent();
  const now = useMemo(() => new Date(), []);

  return (
    <StaffUtilizationDashboard
      people={people ?? []}
      shifts={shifts ?? []}
      timeRecords={timeRecords ?? []}
      events={events ?? []}
      loading={
        people === undefined ||
        shifts === undefined ||
        timeRecords === undefined ||
        events === undefined
      }
      now={now}
    />
  );
}
