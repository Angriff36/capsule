import type { ReportSubjectArea } from "./ReportCreateForm";

type SourceRow = Record<string, unknown>;

/**
 * The fields, in order, whose first set value dates a row for a report (the
 * screen loads only rows dated in the report's period by these).
 */
export const REPORT_DATE_FIELDS: Record<ReportSubjectArea, readonly string[]> =
  {
    events: ["startsAt", "createdAt", "_creationTime"],
    sales: ["eventDate", "sentAt", "createdAt", "_creationTime"],
    inventory: [
      "purchasingWeekStart",
      "confirmedAt",
      "calculatedAt",
      "createdAt",
      "_creationTime",
    ],
    production: ["dueAt", "completedAt", "createdAt", "_creationTime"],
    workforce: ["startsAt", "createdAt", "_creationTime"],
    logistics: ["windowStartsAt", "scheduledAt", "createdAt", "_creationTime"],
    finance: ["issuedAt", "dueDate", "createdAt", "_creationTime"],
  };

/**
 * The date that puts a row in a report period, per subject. The builders,
 * the left-out counts and metricDefinitions' dateBasis words all follow it.
 */
export const REPORT_DATE_OF: Record<
  ReportSubjectArea,
  (row: SourceRow) => number | null
> = {
  events: (row) => firstDate(row, ...REPORT_DATE_FIELDS.events),
  sales: (row) => firstDate(row, ...REPORT_DATE_FIELDS.sales),
  inventory: (row) => firstDate(row, ...REPORT_DATE_FIELDS.inventory),
  production: (row) => firstDate(row, ...REPORT_DATE_FIELDS.production),
  workforce: (row) => firstDate(row, ...REPORT_DATE_FIELDS.workforce),
  logistics: (row) => firstDate(row, ...REPORT_DATE_FIELDS.logistics),
  finance: (row) => firstDate(row, ...REPORT_DATE_FIELDS.finance),
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
