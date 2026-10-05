import type { ReportChartType } from "./ReportCreateForm";
import type { ReportLeftOut } from "./LiveReportData";
import type { LiveReportModel, ReportDateWindow } from "./liveReportModel";
import type { ReportFilters } from "./reportFilters";

/**
 * The newest change in a report's source records (their own updatedAt, or
 * when they were made). It names the data revision the figures come from, so
 * a saved edit shows up as a later "as of" time once the report has it.
 */
export function reportSourceAsOf(
  ...lists: readonly (readonly unknown[] | undefined)[]
): number | null {
  let newest: number | null = null;
  for (const rows of lists)
    for (const row of rows ?? []) {
      const record = row as { updatedAt?: unknown; _creationTime?: unknown };
      const value =
        typeof record.updatedAt === "number"
          ? record.updatedAt
          : typeof record._creationTime === "number"
            ? record._creationTime
            : null;
      if (value != null && (newest == null || value > newest)) newest = value;
    }
  return newest;
}

/** Whether the screen is still getting changes from Capsule. */
export interface ReportFreshness {
  live: boolean;
  /** Last moment the screen was known to be getting changes. */
  lastLiveAt: number | null;
}

/** Null while live; otherwise the warning that replaces "current". */
export function reportStaleNotice(
  freshness: ReportFreshness,
  formatTime: (value: number) => string,
): string | null {
  if (freshness.live) return null;
  return freshness.lastLiveAt == null
    ? "Capsule can't reach the server, so these figures may be out of date. They update by themselves when the connection is back."
    : `Capsule lost its connection at ${formatTime(freshness.lastLiveAt)}. These figures are from then and may be out of date. They update by themselves when the connection is back.`;
}

/** What a snapshot keeps: the figures as shown plus how they were chosen. */
export interface ReportSnapshotFigures {
  version: 1;
  chartType: ReportChartType;
  dateWindow: ReportDateWindow;
  filters: ReportFilters;
  leftOut: ReportLeftOut;
  model: LiveReportModel;
  /** Rows not kept because the snapshot would be too large to save. */
  rowsNotKept: number;
}

// A saved record holds at most 1 MB; keep the figures well under it.
const MAX_SNAPSHOT_CHARS = 700_000;

export function reportSnapshotFigures(input: {
  chartType: ReportChartType;
  dateWindow: ReportDateWindow;
  filters: ReportFilters;
  leftOut: ReportLeftOut;
  model: LiveReportModel;
}): ReportSnapshotFigures {
  // A plain JSON copy: no undefined fields, nothing shared with the screen.
  const text = JSON.stringify({ version: 1, ...input, rowsNotKept: 0 });
  const figures = JSON.parse(text) as ReportSnapshotFigures;
  if (text.length <= MAX_SNAPSHOT_CHARS) return figures;
  return {
    ...figures,
    model: { ...figures.model, rows: [] },
    rowsNotKept: input.model.rows.length,
  };
}

/** The saved figures, or null when the record is not a snapshot this app wrote. */
export function readReportSnapshotFigures(
  value: unknown,
): ReportSnapshotFigures | null {
  const figures = value as Partial<ReportSnapshotFigures> | null;
  if (
    !figures ||
    figures.version !== 1 ||
    !figures.model ||
    !Array.isArray(figures.model.kpis) ||
    !Array.isArray(figures.model.rows)
  )
    return null;
  return figures as ReportSnapshotFigures;
}
