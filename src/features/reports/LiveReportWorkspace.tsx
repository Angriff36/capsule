import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { formatCount, formatDate, formatMoney } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { TableSkeleton } from "../../ui/primitives";
import { BarChart } from "../../ui/charts/BarChart";
import { LineChart } from "../../ui/charts/LineChart";
import { PieChart } from "../../ui/charts/PieChart";
import {
  REPORT_CHART_TYPES,
  type ReportChartType,
  type ReportSubjectArea,
} from "./ReportCreateForm";
import {
  downloadLiveReportCsv,
  REPORT_DATE_WINDOWS,
  REPORT_DATE_WINDOW_LABELS,
  type LiveReportModel,
  type ReportCellValue,
  type ReportColumn,
  type ReportDateWindow,
  type SavedReportRow,
} from "./liveReportModel";
import { SAVED_REPORT_READ_ONLY_NOTICE } from "./reportEditAccess";
import { MetricDefinitionList } from "./MetricDefinitionList";
import { ReportFilterBar } from "./ReportFilterBar";
import { activeFilterCount, type ReportFilters } from "./reportFilters";
import type { ReportLeftOut } from "./LiveReportData";

interface LiveReportWorkspaceProps {
  report: SavedReportRow;
  subject: ReportSubjectArea;
  savedDateWindow: ReportDateWindow;
  savedChartType: ReportChartType;
  usedChartFallback: boolean;
  model: LiveReportModel | null;
  loading: boolean;
  sourceAvailable: boolean;
  busy: boolean;
  /**
   * False for a viewer who does not own this shared report: the
   * updateDefinition command would reject the save, so the controls stay
   * read-only instead of sending the viewer into that guard failure.
   */
  canEditSettings: boolean;
  onApply: (dateWindow: ReportDateWindow, chartType: ReportChartType) => void;
  /** Filters on screen (page address first, else the saved ones). */
  filters: ReportFilters;
  /** Changes the view at once for every reader; Apply also saves it. */
  onFiltersChange: (filters: ReportFilters) => void;
  leftOut: ReportLeftOut;
}

export function LiveReportWorkspace({
  report,
  subject,
  savedDateWindow,
  savedChartType,
  usedChartFallback,
  model,
  loading,
  sourceAvailable,
  busy,
  canEditSettings,
  onApply,
  filters,
  onFiltersChange,
  leftOut,
}: LiveReportWorkspaceProps) {
  const [dateWindow, setDateWindow] = useState(savedDateWindow);
  const [chartType, setChartType] = useState(savedChartType);
  const controlsLocked = busy || !canEditSettings;

  useEffect(() => {
    setDateWindow(savedDateWindow);
    setChartType(savedChartType);
  }, [report._id, savedChartType, savedDateWindow]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEditSettings) return;
    onApply(dateWindow, chartType);
  };

  return (
    <section className="live-report" aria-labelledby="live-report-title">
      <div className="live-report-heading">
        <div>
          <div className="live-report-eyebrow">
            <span>Current data</span>
            <span>{formatStatusLabel(subject)}</span>
            <span>{REPORT_DATE_WINDOW_LABELS[savedDateWindow]}</span>
          </div>
          <h2 id="live-report-title">{String(report.name || "Untitled")}</h2>
          <p>
            This result stays connected to what's happening in Capsule now, and
            updates when its source changes.
          </p>
        </div>
        <span className="live-report-sharing">
          {sharingLabel(report.sharingScope)}
        </span>
      </div>

      <form className="live-report-controls" onSubmit={submit}>
        <label>
          <span>Date window</span>
          <select
            className="input"
            value={dateWindow}
            onChange={(event) =>
              setDateWindow(event.target.value as ReportDateWindow)
            }
            disabled={controlsLocked}
          >
            {REPORT_DATE_WINDOWS.map((window) => (
              <option key={window} value={window}>
                {REPORT_DATE_WINDOW_LABELS[window]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Visualization</span>
          <select
            className="input"
            value={chartType}
            onChange={(event) =>
              setChartType(event.target.value as ReportChartType)
            }
            disabled={controlsLocked}
          >
            {REPORT_CHART_TYPES.map((type) => (
              <option key={type} value={type}>
                {formatStatusLabel(type)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-primary btn-sm"
          type="submit"
          disabled={controlsLocked}
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </form>

      <ReportFilterBar
        filters={filters}
        disabled={busy}
        onChange={onFiltersChange}
      />
      <p className="live-report-notice" role="status">
        {activeFilterCount(filters) > 0
          ? `${formatCount(activeFilterCount(filters))} filters on. The page address keeps them, so a copied link opens this same view.`
          : "No filters on. Filters change the figures, the chart, the rows and the export together."}
        {canEditSettings ? " Apply also saves them with the report." : ""}
      </p>

      {canEditSettings ? null : (
        <p className="live-report-notice" role="status">
          {SAVED_REPORT_READ_ONLY_NOTICE}
        </p>
      )}

      {usedChartFallback ? (
        <p className="live-report-notice" role="status">
          This saved report used an unsupported chart type, so Capsule opened it
          as a table. Apply to save the table choice.
        </p>
      ) : null}

      {loading ? (
        <div className="live-report-loading">
          <TableSkeleton rows={6} />
        </div>
      ) : !sourceAvailable ? (
        <div className="document-empty live-report-unavailable" role="status">
          <p>Source data isn’t available for your role.</p>
          <span>
            You can see this saved report, but it does not give you access to
            the underlying {formatStatusLabel(subject)} data.
          </span>
        </div>
      ) : model ? (
        <ReportResult
          reportName={String(report.name || "Untitled")}
          chartType={chartType}
          model={model}
          leftOut={leftOut}
        />
      ) : null}
    </section>
  );
}

function ReportResult({
  reportName,
  chartType,
  model,
  leftOut,
}: {
  reportName: string;
  chartType: ReportChartType;
  model: LiveReportModel;
  leftOut: ReportLeftOut;
}) {
  const noRows = model.rows.length === 0;
  const [focusId, setFocusId] = useState<string | null>(null);
  const focus = model.kpis.find((item) => item.metricId === focusId) ?? null;
  const visibleRows = useMemo(() => {
    if (!focus?.rowIds) return model.rows;
    const behind = new Set(focus.rowIds);
    return model.rows.filter((row) => behind.has(row.id));
  }, [focus, model.rows]);
  const periodLeftOut = model.leftOut;
  return (
    <>
      <div className="report-kpi-grid">
        {model.kpis.map((item) => (
          <div className="report-kpi" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <button
              type="button"
              className="mt-1 text-xs text-brand underline"
              aria-pressed={focusId === item.metricId}
              data-testid={`report-kpi-drill-${item.metricId}`}
              onClick={() =>
                setFocusId(focusId === item.metricId ? null : item.metricId)
              }
            >
              {focusId === item.metricId
                ? "Show all rows"
                : `See the ${formatCount(item.rowIds?.length ?? model.rows.length)} rows behind it`}
            </button>
          </div>
        ))}
      </div>
      <p
        className="live-report-notice"
        role="status"
        data-testid="report-period-left-out"
      >
        Not counted: {formatCount(periodLeftOut.outsidePeriod)} outside the
        period, {formatCount(periodLeftOut.deleted)} deleted
        {periodLeftOut.noDate > 0
          ? `, ${formatCount(periodLeftOut.noDate)} with no date`
          : ""}
        .
        {periodLeftOut.repeatedNumbers > 0
          ? ` ${formatCount(periodLeftOut.repeatedNumbers)} counted rows share a number with another row; check them for doubles.`
          : ""}
      </p>
      {leftOut.filteredOut + leftOut.noEvent > 0 ? (
        <p
          className="live-report-notice"
          role="status"
          data-testid="report-left-out"
        >
          Left out by the filters: {formatCount(leftOut.filteredOut)} rows.
          {leftOut.noEvent > 0
            ? ` ${formatCount(leftOut.noEvent)} more rows belong to no event you can see, so an event filter cannot keep them.`
            : ""}
        </p>
      ) : null}

      {noRows ? (
        <div className="document-empty live-report-empty">
          <p>Nothing falls in this date window.</p>
          <span>The live result will update when matching rows exist.</span>
        </div>
      ) : (
        <div className="live-report-chart" aria-label={`${reportName} chart`}>
          {chartType === "table" ? (
            <div className="live-report-table-lead">
              <span>Table view</span>
              <strong>{formatCount(model.rows.length)} source rows</strong>
            </div>
          ) : null}
          {chartType === "bar" ? (
            <BarChart
              data={model.breakdown}
              xAxisKey="label"
              series={[
                {
                  dataKey: "value",
                  name: "Total",
                  color: "var(--color-brand)",
                },
              ]}
              height={320}
              showLegend={false}
            />
          ) : null}
          {chartType === "line" ? (
            <LineChart
              data={model.trend}
              xAxisKey="label"
              series={trendChartSeries(model)}
              height={320}
              formatYAxis={trendAxisFormatter(model.trendSeries[0]?.valueKind)}
              formatRightYAxis={trendAxisFormatter(
                rightAxisKind(model) ?? model.trendSeries[0]?.valueKind,
              )}
            />
          ) : null}
          {chartType === "pie" ? (
            <PieChart
              data={model.breakdown
                .filter((point) => point.value > 0)
                .map((point) => ({ name: point.label, value: point.value }))}
              height={320}
              innerRadius={48}
            />
          ) : null}
        </div>
      )}

      <div className="live-report-detail-heading">
        <div>
          <span>Evidence</span>
          <h3>
            {focus?.rowIds
              ? `${formatCount(visibleRows.length)} rows behind ${focus.label}`
              : `${formatCount(model.rows.length)} matching rows`}
          </h3>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={visibleRows.length === 0}
          onClick={() =>
            downloadLiveReportCsv({ ...model, rows: visibleRows }, reportName)
          }
        >
          Export CSV
        </button>
      </div>

      <div className="report-detail-scroll">
        <table
          className="supply-table live-report-table"
          aria-label={`${reportName} evidence rows`}
        >
          <thead>
            <tr>
              {model.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.id}>
                {model.columns.map((column) => (
                  <td key={column.key}>
                    {formatCell(row.values[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="live-report-source">
        <div>
          <span>Live source</span>
          <strong>{model.sourceLabel}</strong>
          <p>{model.sourceDescription}</p>
        </div>
        <Link className="btn btn-ghost btn-sm" to={model.sourcePath}>
          Open source workspace
        </Link>
      </div>

      <MetricDefinitionList
        metricIds={model.kpis.map((item) => item.metricId)}
      />
    </>
  );
}

function trendChartSeries(model: LiveReportModel) {
  const leftKind = model.trendSeries[0]?.valueKind;
  return model.trendSeries.map((series) => ({
    dataKey: series.dataKey,
    name: series.name,
    color: series.color,
    yAxisId:
      leftKind != null && series.valueKind !== leftKind
        ? ("right" as const)
        : ("left" as const),
  }));
}

function rightAxisKind(model: LiveReportModel) {
  const leftKind = model.trendSeries[0]?.valueKind;
  return model.trendSeries.find((series) => series.valueKind !== leftKind)
    ?.valueKind;
}

function trendAxisFormatter(
  kind: LiveReportModel["trendSeries"][number]["valueKind"] | undefined,
) {
  if (kind === "money") return (value: number) => formatMoney(value);
  if (kind === "hours") {
    return (value: number) =>
      `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}h`;
  }
  return (value: number) => formatCount(value);
}

function formatCell(
  value: ReportCellValue | undefined,
  column: ReportColumn,
): string {
  if (column.kind === "date") {
    return typeof value === "number" ? formatDate(value) : "—";
  }
  if (column.kind === "money") {
    return typeof value === "number" ? formatMoney(value) : "—";
  }
  if (column.kind === "number") {
    return typeof value === "number"
      ? value.toLocaleString("en-US", { maximumFractionDigits: 2 })
      : "—";
  }
  if (value == null || value === "") return "—";
  if (["status", "stage", "category", "unit"].includes(column.key)) {
    return formatStatusLabel(String(value));
  }
  return String(value);
}

function sharingLabel(value: unknown): string {
  if (value === "team") return "My team";
  if (value === "tenant_wide") return "Whole company";
  return "Only me";
}
