import type { ReportSubjectArea } from "./ReportCreateForm";

type SourceRow = Record<string, unknown>;

/**
 * The date that puts a row in a report period, per subject. The builders,
 * the left-out counts and metricDefinitions' dateBasis words all follow it.
 */
export const REPORT_DATE_OF: Record<
  ReportSubjectArea,
  (row: SourceRow) => number | null
> = {
  events: (row) => firstDate(row, "startsAt", "createdAt", "_creationTime"),
  sales: (row) =>
    firstDate(row, "eventDate", "sentAt", "createdAt", "_creationTime"),
  inventory: (row) =>
    firstDate(
      row,
      "purchasingWeekStart",
      "confirmedAt",
      "calculatedAt",
      "createdAt",
      "_creationTime",
    ),
  production: (row) =>
    firstDate(row, "dueAt", "completedAt", "createdAt", "_creationTime"),
  workforce: (row) => firstDate(row, "startsAt", "createdAt", "_creationTime"),
  logistics: (row) =>
    firstDate(
      row,
      "windowStartsAt",
      "scheduledAt",
      "createdAt",
      "_creationTime",
    ),
  finance: (row) =>
    firstDate(row, "issuedAt", "dueDate", "createdAt", "_creationTime"),
};

export function firstDate(row: SourceRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = date(row[key]);
    if (value != null) return value;
  }
  return null;
}

export function date(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}
