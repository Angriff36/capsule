import type { ReportChartType, ReportSubjectArea } from "./ReportCreateForm";

export const REPORT_DATE_WINDOWS = [
  "30_days",
  "90_days",
  "12_months",
  "all_time",
] as const;

export type ReportDateWindow = (typeof REPORT_DATE_WINDOWS)[number];
export type ReportCellValue = string | number | null;
export type ReportColumnKind = "text" | "number" | "date" | "money";

export interface LiveReportDefinition {
  version: 2;
  dateWindow: ReportDateWindow;
  notes?: string;
}

export interface ReportKpi {
  label: string;
  value: string;
}

export interface ReportChartPoint extends Record<string, string | number> {
  label: string;
  value: number;
}

export interface ReportTrendSeries {
  dataKey: string;
  name: string;
  color: string;
  valueKind: "count" | "money" | "hours";
}

export interface ReportColumn {
  key: string;
  label: string;
  kind: ReportColumnKind;
}

export interface ReportRow {
  id: string;
  values: Record<string, ReportCellValue>;
}

export interface LiveReportModel {
  subject: ReportSubjectArea;
  sourceLabel: string;
  sourceDescription: string;
  sourcePath: string;
  effectiveWindow: ReportDateWindow;
  kpis: ReportKpi[];
  trend: ReportChartPoint[];
  trendSeries: ReportTrendSeries[];
  breakdown: ReportChartPoint[];
  columns: ReportColumn[];
  rows: ReportRow[];
  csvFilename: string;
}

export interface SavedReportRow {
  _id: string;
  version: number;
  status: unknown;
  /** Person id that owns the definition; only the owner may updateDefinition. */
  ownerId?: string | null;
  name?: string | null;
  subjectArea?: string | null;
  chartType?: string | null;
  sharingScope?: string | null;
  definition?: unknown;
  definedAt?: number | null;
  deletedAt?: number | null;
}

export const REPORT_DATE_WINDOW_LABELS: Record<ReportDateWindow, string> = {
  "30_days": "Last 30 days",
  "90_days": "Last 90 days",
  "12_months": "Last 12 months",
  all_time: "All time",
};

export function parseLiveReportDefinition(
  value: unknown,
): LiveReportDefinition {
  const candidate = isRecord(value) ? value : {};
  const requestedWindow = candidate.dateWindow;
  const dateWindow = REPORT_DATE_WINDOWS.includes(
    requestedWindow as ReportDateWindow,
  )
    ? (requestedWindow as ReportDateWindow)
    : "all_time";
  return {
    version: 2,
    dateWindow,
    notes:
      typeof candidate.notes === "string" && candidate.notes.trim()
        ? candidate.notes.trim()
        : undefined,
  };
}

export function normalizeReportSubject(
  value: unknown,
): ReportSubjectArea | null {
  const subjects: ReportSubjectArea[] = [
    "events",
    "sales",
    "inventory",
    "production",
    "workforce",
    "logistics",
    "finance",
  ];
  return subjects.includes(value as ReportSubjectArea)
    ? (value as ReportSubjectArea)
    : null;
}

export function normalizeReportChart(value: unknown): {
  chartType: ReportChartType;
  usedFallback: boolean;
} {
  const chartTypes: ReportChartType[] = ["table", "bar", "line", "pie"];
  if (chartTypes.includes(value as ReportChartType)) {
    return { chartType: value as ReportChartType, usedFallback: false };
  }
  return { chartType: "table", usedFallback: true };
}

export function reportCsv(
  model: LiveReportModel,
  reportName: string,
): { filename: string; contents: string } {
  const header = model.columns.map((column) => csvCell(column.label)).join(",");
  const rows = model.rows.map((row) =>
    model.columns
      .map((column) => {
        const value = row.values[column.key];
        if (column.kind === "date" && typeof value === "number") {
          return csvCell(new Date(value).toISOString());
        }
        return csvCell(value);
      })
      .join(","),
  );
  const safeName = reportName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const exportDate = new Date().toISOString().slice(0, 10);
  return {
    filename: `${safeName || model.csvFilename}-${exportDate}.csv`,
    contents: [header, ...rows].join("\r\n") + "\r\n",
  };
}

export function downloadLiveReportCsv(
  model: LiveReportModel,
  reportName: string,
): void {
  const csv = reportCsv(model, reportName);
  const blob = new Blob([csv.contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = csv.filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: ReportCellValue | undefined): string {
  if (typeof value === "number") {
    return String(value);
  }
  const raw = value ?? "";
  const safe = /^[=+\-@]/u.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
