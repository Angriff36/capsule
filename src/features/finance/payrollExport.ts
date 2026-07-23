import { parseTipPayrollNote, payrollNoteDisplayText } from "./tipDistribution";

export type PayrollProcessor = "gusto" | "adp" | "paychex";

export const PAYROLL_PROCESSORS: readonly {
  value: PayrollProcessor;
  label: string;
  detail: string;
}[] = [
  {
    value: "gusto",
    label: "Gusto Smart Import",
    detail: "Wide CSV with regular, overtime, and audit columns.",
  },
  {
    value: "adp",
    label: "ADP mapping CSV",
    detail: "Uses ADP's REG HRS and O/T HRS vocabulary.",
  },
  {
    value: "paychex",
    label: "Paychex mapping CSV",
    detail: "Uses worker ID plus regular and overtime hour columns.",
  },
] as const;

type PersonRow = {
  _id: string;
  employeeNumber?: unknown;
  givenName?: unknown;
  familyName?: unknown;
  deletedAt?: unknown;
};

type TimeRecordRow = {
  personId?: unknown;
  clockInAt?: unknown;
  clockOutAt?: unknown;
  breakMinutes?: unknown;
  status?: unknown;
  deletedAt?: unknown;
};

type PayrollInputRow = {
  personId?: unknown;
  periodStart?: unknown;
  periodEnd?: unknown;
  regularMinutes?: unknown;
  overtimeMinutes?: unknown;
  grossAmount?: unknown;
  notes?: unknown;
  status?: unknown;
  deletedAt?: unknown;
};

export type PayrollExportRow = {
  personId: string;
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  recordedHours: number;
  manualAdjustmentHours: number;
  grossAmount: number | null;
  memo: string;
  timeRecordCount: number;
  payrollInputCount: number;
  usesFallbackEmployeeId: boolean;
};

export type PayrollExportDocument = {
  processor: PayrollProcessor;
  periodStart: string;
  periodEnd: string;
  filename: string;
  csv: string;
  rows: PayrollExportRow[];
  timeRecordCount: number;
  payrollInputCount: number;
  fallbackEmployeeIdCount: number;
};

type BuildPayrollExportInput = {
  processor: PayrollProcessor;
  periodStart: string;
  periodEnd: string;
  people: readonly PersonRow[];
  timeRecords: readonly TimeRecordRow[];
  payrollInputs: readonly PayrollInputRow[];
};

type Accumulator = {
  personId: string;
  recordedMinutes: number;
  inputRegularMinutes: number;
  inputOvertimeMinutes: number;
  grossAmount: number;
  hasGrossAmount: boolean;
  notes: Set<string>;
  timeRecordCount: number;
  payrollInputCount: number;
  minuteInputCount: number;
};

const PAYROLL_READY_TIME_STATUSES = new Set(["closed", "corrected"]);

function localDayStart(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const date = new Date(`${value}T00:00:00`);
  return date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10))
    ? date.getTime()
    : Number.NaN;
}

function timestamp(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }
  return Number.NaN;
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getAccumulator(map: Map<string, Accumulator>, personId: string) {
  const current = map.get(personId);
  if (current) return current;
  const created: Accumulator = {
    personId,
    recordedMinutes: 0,
    inputRegularMinutes: 0,
    inputOvertimeMinutes: 0,
    grossAmount: 0,
    hasGrossAmount: false,
    notes: new Set(),
    timeRecordCount: 0,
    payrollInputCount: 0,
    minuteInputCount: 0,
  };
  map.set(personId, created);
  return created;
}

function roundHours(minutes: number) {
  return Math.round((minutes / 60) * 100) / 100;
}

function spreadsheetSafe(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: string | number, protectFormula: boolean) {
  const raw = String(value);
  const text = protectFormula ? spreadsheetSafe(raw) : raw;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvLine(
  values: readonly (string | number)[],
  protectedColumns: readonly number[] = [],
) {
  const protectedSet = new Set(protectedColumns);
  return values
    .map((value, index) => csvCell(value, protectedSet.has(index)))
    .join(",");
}

function formatHours(value: number) {
  return value.toFixed(2);
}

function formatAmount(value: number | null) {
  return value == null ? "" : value.toFixed(2);
}

function processorCsv(
  processor: PayrollProcessor,
  rows: readonly PayrollExportRow[],
  periodStart: string,
  periodEnd: string,
) {
  const commonValues = (row: PayrollExportRow) => [
    row.employeeId,
    row.employeeName,
    formatHours(row.regularHours),
    formatHours(row.overtimeHours),
    formatHours(row.recordedHours),
    formatHours(row.manualAdjustmentHours),
    formatAmount(row.grossAmount),
    periodStart,
    periodEnd,
    row.memo,
  ];

  const headers =
    processor === "adp"
      ? [
          "Employee ID",
          "Employee Name",
          "REG HRS",
          "O/T HRS",
          "Recorded Hours",
          "Manual Adjustment Hours",
          "Gross Amount",
          "Pay Period Start",
          "Pay Period End",
          "Memo",
        ]
      : processor === "paychex"
        ? [
            "Worker ID",
            "Employee Name",
            "Regular Hours",
            "Overtime Hours",
            "Recorded Hours",
            "Manual Adjustment Hours",
            "Gross Amount",
            "Pay Period Start",
            "Pay Period End",
            "Memo",
          ]
        : [
            "Employee ID",
            "Employee Name",
            "Regular Hours",
            "Overtime Hours",
            "Recorded Hours",
            "Manual Adjustment Hours",
            "Gross Amount",
            "Pay Period Start",
            "Pay Period End",
            "Memo",
          ];

  return `\ufeff${[
    csvLine(headers),
    ...rows.map((row) => csvLine(commonValues(row), [0, 1, 9])),
  ].join("\r\n")}\r\n`;
}

/**
 * Compiles payroll-ready time plus finalized payroll inputs without writing a
 * second source of truth. A finalized input is the reviewed person/period
 * total; its delta from completed clocked time is the manual adjustment.
 */
export function buildPayrollExport({
  processor,
  periodStart,
  periodEnd,
  people,
  timeRecords,
  payrollInputs,
}: BuildPayrollExportInput): PayrollExportDocument {
  const startAt = localDayStart(periodStart);
  const endAt = localDayStart(periodEnd);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt)) {
    throw new Error("Choose a valid payroll period.");
  }
  if (endAt < startAt) {
    throw new Error("Payroll period end must be on or after its start.");
  }
  const endExclusive = new Date(endAt);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const endExclusiveAt = endExclusive.getTime();
  const accumulators = new Map<string, Accumulator>();

  for (const record of timeRecords) {
    if (
      record.deletedAt != null ||
      !PAYROLL_READY_TIME_STATUSES.has(String(record.status))
    ) {
      continue;
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
      continue;
    }
    const workedMinutes = Math.max(
      0,
      (clockOutAt - clockInAt) / 60_000 -
        Math.max(0, finiteNumber(record.breakMinutes)),
    );
    const accumulator = getAccumulator(accumulators, personId);
    accumulator.recordedMinutes += workedMinutes;
    accumulator.timeRecordCount += 1;
  }

  for (const input of payrollInputs) {
    if (input.deletedAt != null || String(input.status) !== "finalized") {
      continue;
    }
    const personId = cleanText(input.personId);
    const inputStart = timestamp(input.periodStart);
    const inputEnd = timestamp(input.periodEnd);
    if (
      !personId ||
      !Number.isFinite(inputStart) ||
      !Number.isFinite(inputEnd) ||
      inputStart < startAt ||
      inputEnd > endExclusiveAt
    ) {
      continue;
    }
    const accumulator = getAccumulator(accumulators, personId);
    const gratuity = parseTipPayrollNote(input.notes);
    if (!gratuity) {
      accumulator.inputRegularMinutes += Math.max(
        0,
        finiteNumber(input.regularMinutes),
      );
      accumulator.inputOvertimeMinutes += Math.max(
        0,
        finiteNumber(input.overtimeMinutes),
      );
      accumulator.minuteInputCount += 1;
    }
    const structuredAmount = finiteNumber(input.grossAmount, Number.NaN);
    const amount = Number.isFinite(structuredAmount)
      ? structuredAmount
      : gratuity
        ? gratuity.amountCents / 100
        : Number.NaN;
    if (Number.isFinite(amount)) {
      accumulator.grossAmount += amount;
      accumulator.hasGrossAmount = true;
    }
    const note = payrollNoteDisplayText(input.notes);
    if (note) accumulator.notes.add(note);
    accumulator.payrollInputCount += 1;
  }

  const peopleById = new Map(people.map((person) => [person._id, person]));
  const rows = [...accumulators.values()]
    .map((entry): PayrollExportRow => {
      const person = peopleById.get(entry.personId);
      const employeeNumber = cleanText(person?.employeeNumber);
      const employeeName =
        [cleanText(person?.givenName), cleanText(person?.familyName)]
          .filter(Boolean)
          .join(" ") || "Unknown person";
      const hasReviewedInput = entry.minuteInputCount > 0;
      const regularMinutes = hasReviewedInput
        ? entry.inputRegularMinutes
        : entry.recordedMinutes;
      const overtimeMinutes = hasReviewedInput ? entry.inputOvertimeMinutes : 0;
      const manualAdjustmentMinutes =
        regularMinutes + overtimeMinutes - entry.recordedMinutes;
      const sourceSummary = `${entry.timeRecordCount} completed time record${entry.timeRecordCount === 1 ? "" : "s"}; ${entry.payrollInputCount} finalized payroll input${entry.payrollInputCount === 1 ? "" : "s"}`;
      const memo = [sourceSummary, ...entry.notes].join(" | ");
      return {
        personId: entry.personId,
        employeeId: employeeNumber || entry.personId,
        employeeName,
        regularHours: roundHours(regularMinutes),
        overtimeHours: roundHours(overtimeMinutes),
        recordedHours: roundHours(entry.recordedMinutes),
        manualAdjustmentHours: roundHours(manualAdjustmentMinutes),
        grossAmount: entry.hasGrossAmount
          ? Math.round(entry.grossAmount * 100) / 100
          : null,
        memo,
        timeRecordCount: entry.timeRecordCount,
        payrollInputCount: entry.payrollInputCount,
        usesFallbackEmployeeId: !employeeNumber,
      };
    })
    .sort(
      (a, b) =>
        a.employeeName.localeCompare(b.employeeName) ||
        a.employeeId.localeCompare(b.employeeId),
    );

  return {
    processor,
    periodStart,
    periodEnd,
    filename: `payroll-${processor}-${periodStart}-to-${periodEnd}.csv`,
    csv: processorCsv(processor, rows, periodStart, periodEnd),
    rows,
    timeRecordCount: rows.reduce(
      (total, row) => total + row.timeRecordCount,
      0,
    ),
    payrollInputCount: rows.reduce(
      (total, row) => total + row.payrollInputCount,
      0,
    ),
    fallbackEmployeeIdCount: rows.filter((row) => row.usesFallbackEmployeeId)
      .length,
  };
}
