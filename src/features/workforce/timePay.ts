/**
 * Pay rules for recorded time (spec §12.2, §15.4).
 *
 * - Elapsed time is instant to instant, so an overnight shift or a
 *   daylight-saving night counts the minutes that really passed.
 * - Lunch (`breakMinutes`) is unpaid and comes off; other breaks
 *   (`paidBreakMinutes`) stay paid and never come off.
 * - Payroll takes only approved entries. Hours over the weekly threshold
 *   (Monday-start local week of the clock-in) are overtime.
 * - Attendance alerts are read from shifts and entries; they never block
 *   payroll for anyone.
 */
import {
  DEFAULT_OVERTIME_THRESHOLD_HOURS,
  startOfLocalWeek,
} from "./overtimeProjection";

export type PayTimeRecord = {
  _id?: unknown;
  personId?: unknown;
  shiftId?: unknown;
  eventId?: unknown;
  clockInAt?: unknown;
  clockOutAt?: unknown;
  breakMinutes?: unknown;
  paidBreakMinutes?: unknown;
  status?: unknown;
  approvedAt?: unknown;
  _creationTime?: unknown;
  deletedAt?: unknown;
};

const FINISHED = new Set(["closed", "corrected"]);

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
}

function whole(value: unknown): number {
  const n = num(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isFinishedTime(record: PayTimeRecord): boolean {
  return (
    record.deletedAt == null &&
    FINISHED.has(String(record.status)) &&
    Number.isFinite(num(record.clockInAt)) &&
    Number.isFinite(num(record.clockOutAt)) &&
    num(record.clockOutAt) >= num(record.clockInAt)
  );
}

/**
 * Time approval started with the 2026-09-30 release. Finished entries made
 * before it never had an approval step, so they count as approved: no hours
 * already ready for payroll disappear when the release goes live.
 */
export const TIME_APPROVAL_REQUIRED_FROM = Date.parse("2026-09-30T12:00:00Z");

export function hasPayrollApproval(record: {
  approvedAt?: unknown;
  _creationTime?: unknown;
}): boolean {
  if (record.approvedAt != null) return true;
  const created = num(record._creationTime);
  return Number.isFinite(created) && created < TIME_APPROVAL_REQUIRED_FROM;
}

export function isApprovedTime(record: PayTimeRecord): boolean {
  return isFinishedTime(record) && hasPayrollApproval(record);
}

/** Real minutes between clock-in and clock-out (null while open). */
export function elapsedMinutes(record: PayTimeRecord): number | null {
  const inAt = num(record.clockInAt);
  const outAt = num(record.clockOutAt);
  if (!Number.isFinite(inAt) || !Number.isFinite(outAt) || outAt < inAt)
    return null;
  return (outAt - inAt) / 60_000;
}

/** Paid minutes: elapsed less the unpaid lunch. Paid breaks stay in. */
export function paidMinutes(record: PayTimeRecord): number | null {
  const elapsed = elapsedMinutes(record);
  if (elapsed == null) return null;
  return Math.max(0, elapsed - whole(record.breakMinutes));
}

export type ApprovedPayroll = {
  approvedMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  approvedCount: number;
  waitingApprovalCount: number;
  /** The approved entries counted, so a payroll input can name them. */
  approvedIds: string[];
};

/**
 * Approved time for one person fully inside [startAt, endExclusiveAt),
 * split into regular and overtime by local week.
 */
export function approvedPayroll(
  records: readonly PayTimeRecord[],
  personId: string,
  startAt: number,
  endExclusiveAt: number,
  thresholdHours = DEFAULT_OVERTIME_THRESHOLD_HOURS,
): ApprovedPayroll {
  const inWindow = records.filter(
    (record) =>
      String(record.personId) === personId &&
      isFinishedTime(record) &&
      // A shift belongs to the period it started in, so an overnight shift
      // across the period line is paid once, never dropped.
      num(record.clockInAt) >= startAt &&
      num(record.clockInAt) < endExclusiveAt,
  );
  const approved = inWindow
    .filter((record) => hasPayrollApproval(record))
    .sort((a, b) => num(a.clockInAt) - num(b.clockInAt));
  const thresholdMinutes = thresholdHours * 60;
  const weekTotals = new Map<number, number>();
  // A period that starts midweek: approved shifts that started before it, in
  // that same week, count toward the weekly threshold (they are paid in the
  // period before, which is where a shift crossing the line belongs).
  const weekStart = startOfLocalWeek(startAt);
  for (const record of records) {
    if (
      String(record.personId) !== personId ||
      !isApprovedTime(record) ||
      num(record.clockInAt) < weekStart ||
      num(record.clockInAt) >= startAt
    )
      continue;
    const week = startOfLocalWeek(num(record.clockInAt));
    weekTotals.set(
      week,
      (weekTotals.get(week) ?? 0) + (paidMinutes(record) ?? 0),
    );
  }
  let regularMinutes = 0;
  let overtimeMinutes = 0;
  for (const record of approved) {
    const minutes = paidMinutes(record) ?? 0;
    const week = startOfLocalWeek(num(record.clockInAt));
    const before = weekTotals.get(week) ?? 0;
    const regular = Math.max(0, Math.min(minutes, thresholdMinutes - before));
    regularMinutes += regular;
    overtimeMinutes += minutes - regular;
    weekTotals.set(week, before + minutes);
  }
  const round = (value: number) => Math.round(value);
  return {
    approvedMinutes: round(regularMinutes + overtimeMinutes),
    regularMinutes: round(regularMinutes),
    overtimeMinutes: round(overtimeMinutes),
    approvedCount: approved.length,
    waitingApprovalCount: inWindow.length - approved.length,
    approvedIds: approved
      .map((record) => (record._id == null ? "" : String(record._id)))
      .filter(Boolean),
  };
}

export type OvertimeWarning = {
  personId: string;
  weekStartsAt: number;
  hours: number;
  overtimeHours: number;
};

/** People whose finished time in one local week passes the threshold. */
export function overtimeWarnings(
  records: readonly PayTimeRecord[],
  thresholdHours = DEFAULT_OVERTIME_THRESHOLD_HOURS,
): OvertimeWarning[] {
  const totals = new Map<string, OvertimeWarning>();
  for (const record of records) {
    if (!isFinishedTime(record)) continue;
    const personId = String(record.personId);
    const weekStartsAt = startOfLocalWeek(num(record.clockInAt));
    const key = `${personId}:${weekStartsAt}`;
    const entry = totals.get(key) ?? {
      personId,
      weekStartsAt,
      hours: 0,
      overtimeHours: 0,
    };
    entry.hours += (paidMinutes(record) ?? 0) / 60;
    totals.set(key, entry);
  }
  return [...totals.values()]
    .filter((entry) => entry.hours > thresholdHours)
    .map((entry) => ({
      ...entry,
      hours: Math.round(entry.hours * 100) / 100,
      overtimeHours: Math.round((entry.hours - thresholdHours) * 100) / 100,
    }))
    .sort((a, b) => b.weekStartsAt - a.weekStartsAt);
}

export type AttendanceShift = {
  _id: string;
  personId?: unknown;
  eventId?: unknown;
  startsAt?: number | null;
  endsAt?: number | null;
  status?: unknown;
  deletedAt?: unknown;
};

export type AttendanceAlert = {
  kind: "late" | "not_in" | "no_show" | "still_in";
  personId: string;
  shiftId?: string;
  timeRecordId?: string;
  eventId?: string;
  /** Minutes late, minutes since start, or hours still clocked in. */
  amount: number;
  /** A no-show already marked on the shift. */
  recorded: boolean;
};

const DAY_MS = 24 * 60 * 60_000;
const MATCH_BEFORE_MS = 2 * 60 * 60_000;

/**
 * Manager alerts for the last week of shifts: late clock-ins, people not
 * clocked in after the start, shifts that ended with no time (no-show), and
 * entries still open after `longOpenHours`.
 */
export function attendanceAlerts({
  shifts,
  records,
  now,
  graceMinutes = 10,
  longOpenHours = 14,
}: {
  shifts: readonly AttendanceShift[];
  records: readonly PayTimeRecord[];
  now: number;
  graceMinutes?: number;
  longOpenHours?: number;
}): AttendanceAlert[] {
  const live = records.filter((record) => record.deletedAt == null);
  const alerts: AttendanceAlert[] = [];
  const graceMs = graceMinutes * 60_000;
  for (const shift of shifts) {
    const startsAt = shift.startsAt;
    const endsAt = shift.endsAt;
    if (shift.deletedAt != null || startsAt == null || endsAt == null) continue;
    if (startsAt > now || startsAt < now - 7 * DAY_MS) continue;
    const personId = String(shift.personId ?? "");
    const eventId = shift.eventId ? String(shift.eventId) : undefined;
    const base = { personId, shiftId: shift._id, eventId };
    if (String(shift.status) === "no_show") {
      alerts.push({ ...base, kind: "no_show", amount: 0, recorded: true });
      continue;
    }
    if (!["scheduled", "started"].includes(String(shift.status))) continue;
    const record = live.find(
      (row) =>
        String(row.shiftId ?? "") === shift._id ||
        (String(row.personId) === personId &&
          num(row.clockInAt) >= startsAt - MATCH_BEFORE_MS &&
          num(row.clockInAt) <= endsAt),
    );
    if (record) {
      const lateMs = num(record.clockInAt) - startsAt;
      if (lateMs > graceMs)
        alerts.push({
          ...base,
          kind: "late",
          timeRecordId: record._id ? String(record._id) : undefined,
          amount: Math.round(lateMs / 60_000),
          recorded: false,
        });
      continue;
    }
    if (now > endsAt)
      alerts.push({ ...base, kind: "no_show", amount: 0, recorded: false });
    else if (now > startsAt + graceMs)
      alerts.push({
        ...base,
        kind: "not_in",
        amount: Math.round((now - startsAt) / 60_000),
        recorded: false,
      });
  }
  for (const record of live) {
    if (String(record.status) !== "open" || record.clockOutAt != null) continue;
    const inAt = num(record.clockInAt);
    if (!Number.isFinite(inAt) || now - inAt < longOpenHours * 60 * 60_000)
      continue;
    alerts.push({
      kind: "still_in",
      personId: String(record.personId),
      timeRecordId: record._id ? String(record._id) : undefined,
      eventId: record.eventId ? String(record.eventId) : undefined,
      amount: Math.floor((now - inAt) / (60 * 60_000)),
      recorded: false,
    });
  }
  return alerts;
}

/** Plain words for one alert, with the person's name already known. */
export function attendanceAlertText(
  alert: AttendanceAlert,
  name: string,
): string {
  switch (alert.kind) {
    case "late":
      return `${name} clocked in ${alert.amount} min late.`;
    case "not_in":
      return `${name} has not clocked in. The shift started ${alert.amount} min ago.`;
    case "no_show":
      return alert.recorded
        ? `${name} is marked as a no-show.`
        : `${name} never clocked in for this shift.`;
    case "still_in":
      return `${name} is still clocked in after ${alert.amount} hours. Check the clock-out.`;
  }
}
