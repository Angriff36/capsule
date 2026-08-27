/**
 * Payroll period + clocked-time semantics shared by the export preview
 * (payrollExport.ts), the prepare-form prefill, and the worksheet.
 *
 * One rule everywhere: a payroll period is whole LOCAL days with the end date
 * inclusive, and a time record counts when it is payroll-ready (closed or
 * corrected) and falls entirely inside the window. The Jan-9 "worksheet says
 * 0 minutes, preview says 5.00 h" bug was these surfaces disagreeing on that
 * rule — keep them importing from here so they cannot drift apart again.
 */

export const PAYROLL_READY_TIME_STATUSES: ReadonlySet<string> = new Set([
  "closed",
  "corrected",
]);

export type ClockedTimeRecord = {
  personId?: unknown;
  clockInAt?: unknown;
  clockOutAt?: unknown;
  breakMinutes?: unknown;
  status?: unknown;
  deletedAt?: unknown;
};

/** Local-midnight timestamp for a YYYY-MM-DD value; NaN when invalid. */
export function localDayStart(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const date = new Date(`${value}T00:00:00`);
  return date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10))
    ? date.getTime()
    : Number.NaN;
}

/** Local midnight AFTER a YYYY-MM-DD value — the exclusive period end. */
export function localDayEndExclusive(value: string): number {
  return nextLocalMidnight(localDayStart(value));
}

/** Local midnight of the day containing the timestamp. */
export function dayStartOfTimestamp(at: number): number {
  if (!Number.isFinite(at)) return Number.NaN;
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Local midnight after the day containing the timestamp. */
export function dayEndExclusiveOfTimestamp(at: number): number {
  return nextLocalMidnight(dayStartOfTimestamp(at));
}

function nextLocalMidnight(dayStartAt: number): number {
  if (!Number.isFinite(dayStartAt)) return Number.NaN;
  const next = new Date(dayStartAt);
  next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function timestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

export function finiteNumber(value: unknown, fallback = 0): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Worked minutes for one payroll-ready record fully inside the window, or
 * null when the record does not count.
 */
export function payrollReadyClockedMinutes(
  record: ClockedTimeRecord,
  startAt: number,
  endExclusiveAt: number,
): { personId: string; minutes: number } | null {
  if (
    record.deletedAt != null ||
    !PAYROLL_READY_TIME_STATUSES.has(String(record.status))
  ) {
    return null;
  }
  const personId = cleanText(record.personId);
  const clockInAt = timestamp(record.clockInAt);
  const clockOutAt = timestamp(record.clockOutAt);
  if (
    !personId ||
    !Number.isFinite(clockInAt) ||
    !Number.isFinite(clockOutAt) ||
    clockOutAt < clockInAt ||
    clockInAt < startAt ||
    clockOutAt > endExclusiveAt
  ) {
    return null;
  }
  const minutes = Math.max(
    0,
    (clockOutAt - clockInAt) / 60_000 -
      Math.max(0, finiteNumber(record.breakMinutes)),
  );
  return { personId, minutes };
}

/** Total payroll-ready clocked minutes for one person inside the window. */
export function clockedMinutesForPerson(
  records: readonly ClockedTimeRecord[],
  personId: string,
  startAt: number,
  endExclusiveAt: number,
): number {
  let total = 0;
  for (const record of records) {
    const entry = payrollReadyClockedMinutes(record, startAt, endExclusiveAt);
    if (entry && entry.personId === personId) total += entry.minutes;
  }
  return total;
}

/** Hours rounded the same way the export preview prints them. */
export function roundPayrollHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
