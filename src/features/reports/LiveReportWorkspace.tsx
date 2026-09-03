import { useEffect, useState, type FormEvent } from "react";
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
  onApply: (dateWindow: ReportDateWindow, chartType: ReportChartType) => void;
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
  onApply,
}: LiveReportWorkspaceProps) {
  const [dateWindow, setDateWindow] = useState(savedDateWindow);
  const [chartType, setChartType] = useState(savedChartType);

  useEffect(() => {
    setDateWindow(savedDateWindow);
    setChartType(savedChartType);
  }, [report._id, savedChartType, savedDateWindow]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
            This result stays connected to current Capsule records and updates
            when its source changes.
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
            disabled={busy}
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
            disabled={busy}
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
          disabled={busy}
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </form>

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
            You can see this saved definition, but it does not grant access to
            the underlying {formatStatusLabel(subject)} records.
          </span>
        </div>
      ) : model ? (
        <ReportResult
          reportName={String(report.name || "Untitled")}
          chartType={chartType}
          model={model}
        />
      ) : null}
    </section>
  );
}

function ReportResult({
  reportName,
  chartType,
  model,
}: {
  reportName: string;
  chartType: ReportChartType;
  model: LiveReportModel;
}) {
  const noRows = model.rows.length === 0;
  return (
    <>
      <div className="report-kpi-grid">
        {model.kpis.map((item) => (
          <div className="report-kpi" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      {noRows ? (
        <div className="document-empty live-report-empty">
          <p>No records fall in this date window.</p>
          <span>The live result will update when matching records exist.</span>
        </div>
      ) : (
        <div className="live-report-chart" aria-label={`${reportName} chart`}>
          {chartType === "table" ? (
            <div className="live-report-table-lead">
              <span>Table view</span>
              <strong>{formatCount(model.rows.length)} source records</strong>
            </div>
          ) : null}
          {chartType === "bar" ? (
            <BarChart
              data={model.breakdown}
              xAxisKey="label"
              series={[
                {
                  dataKey: "value",
                  name: "Records",
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
          <h3>{formatCount(model.rows.length)} matching records</h3>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          type="button"
          disabled={noRows}
          onClick={() => downloadLiveReportCsv(model, reportName)}
        >
          Export CSV
        </button>
      </div>

      <div className="report-detail-scroll">
        <table
          className="supply-table live-report-table"
          aria-label={`${reportName} evidence records`}
        >
          <thead>
            <tr>
              {model.columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
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
