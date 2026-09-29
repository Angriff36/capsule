/**
 * PL-PAYROLL (AC-128, AC-130): payroll warnings a person must see before
 * sending, and the revision plan for a person + pay period across repeated
 * exports. A later change to approved time is sent as a new, numbered
 * revision with its difference from what the provider already has - never a
 * silent rewrite. A provider rejection never touches the approved time.
 */
import {
  isApprovedTime,
  isFinishedTime,
  type PayTimeRecord,
} from "../workforce/timePay";

/** One stable key per person and pay period (dates as YYYY-MM-DD). */
export function payrollPeriodKey(
  personId: string,
  periodStart: string,
  periodEnd: string,
): string {
  return `${personId}|${periodStart}|${periodEnd}`;
}

const num = (value: unknown) => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : Number.NaN;
};

/** Plain warnings for one person's time inside [startAt, endExclusiveAt). */
export function payrollRowWarnings({
  records,
  personId,
  startAt,
  endExclusiveAt,
  hourlyRate,
}: {
  records: readonly PayTimeRecord[];
  personId: string;
  startAt: number;
  endExclusiveAt: number;
  /** undefined = rates not known here; null = no rate on file. */
  hourlyRate?: number | null;
}): string[] {
  const mine = records.filter(
    (record) =>
      String(record.personId) === personId &&
      record.deletedAt == null &&
      num(record.clockInAt) >= startAt &&
      num(record.clockInAt) < endExclusiveAt,
  );
  const warnings: string[] = [];
  const approved = mine
    .filter(isApprovedTime)
    .sort((a, b) => num(a.clockInAt) - num(b.clockInAt));
  let overlaps = 0;
  for (let index = 1; index < approved.length; index += 1)
    if (num(approved[index]!.clockInAt) < num(approved[index - 1]!.clockOutAt))
      overlaps += 1;
  if (overlaps > 0)
    warnings.push(
      `${overlaps} approved time ${overlaps === 1 ? "entry overlaps" : "entries overlap"} another — check before sending, or the hours count twice.`,
    );
  const waiting = mine.filter(
    (record) => isFinishedTime(record) && record.approvedAt == null,
  ).length;
  if (waiting > 0)
    warnings.push(
      `${waiting} time ${waiting === 1 ? "entry is" : "entries are"} not approved yet and not in this total.`,
    );
  const open = mine.filter(
    (record) => String(record.status) === "open" && record.clockOutAt == null,
  ).length;
  if (open > 0)
    warnings.push(
      `${open} time ${open === 1 ? "entry is" : "entries are"} still clocked in.`,
    );
  if (hourlyRate === null)
    warnings.push("No hourly rate on file — pay can't be estimated.");
  return warnings;
}

export type PayrollExportReceipt = {
  personId: string;
  periodKey: string;
  revision: number;
  totalMinutes: number;
  status: string;
};

export type PayrollRevisionPlan = {
  personId: string;
  periodKey: string;
  /** Revision this export would record; the last one when nothing changed. */
  revision: number;
  totalMinutes: number;
  /** What the provider has now (last export it did not reject). */
  previousTotalMinutes: number | null;
  deltaMinutes: number;
  changed: boolean;
};

/**
 * For each person in this export (and each person exported before for the
 * same period but now at zero), the revision to record and the change from
 * what was last sent and not rejected.
 */
export function planPayrollRevisions({
  rows,
  receipts,
  periodStart,
  periodEnd,
}: {
  rows: readonly { personId: string; totalMinutes: number }[];
  receipts: readonly PayrollExportReceipt[];
  periodStart: string;
  periodEnd: string;
}): PayrollRevisionPlan[] {
  const totals = new Map(
    rows.map((row) => [row.personId, Math.round(row.totalMinutes)]),
  );
  for (const receipt of receipts)
    if (
      receipt.periodKey ===
        payrollPeriodKey(receipt.personId, periodStart, periodEnd) &&
      !totals.has(receipt.personId)
    )
      totals.set(receipt.personId, 0);
  return [...totals.entries()].map(([personId, totalMinutes]) => {
    const periodKey = payrollPeriodKey(personId, periodStart, periodEnd);
    const history = receipts
      .filter((receipt) => receipt.periodKey === periodKey)
      .sort((a, b) => a.revision - b.revision);
    const lastRevision = history.at(-1)?.revision ?? 0;
    const baseline = [...history]
      .reverse()
      .find((receipt) => receipt.status !== "rejected");
    const previousTotalMinutes = baseline ? baseline.totalMinutes : null;
    const changed =
      history.at(-1)?.status === "rejected" ||
      previousTotalMinutes == null ||
      previousTotalMinutes !== totalMinutes;
    return {
      personId,
      periodKey,
      revision: changed ? lastRevision + 1 : lastRevision,
      totalMinutes,
      previousTotalMinutes,
      deltaMinutes: totalMinutes - (previousTotalMinutes ?? 0),
      changed: changed && (totalMinutes > 0 || previousTotalMinutes != null),
    };
  });
}
