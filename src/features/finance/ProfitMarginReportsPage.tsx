import { useMemo, useState } from "react";
import {
  useListClient,
  useListEvent,
  useListEventCloseout,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import {
  buildProfitMarginCsv,
  buildProfitMarginReport,
  type ProfitMarginClient,
  type ProfitMarginCloseout,
  type ProfitMarginEvent,
  type ProfitMarginGranularity,
  type ProfitMarginReport,
  type ProfitMarginView,
  type ProfitMetrics,
} from "./profitMarginReport";
import "./ProfitMarginReportsPage.css";

const money = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compactMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const day = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function percent(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dateOfMonth = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${dateOfMonth}`;
}

function defaultStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() - 11, 1);
}

function resultCount(
  report: ProfitMarginReport,
  view: ProfitMarginView,
): number {
  if (view === "event") return report.events.length;
  if (view === "client") return report.clients.length;
  return report.periods.length;
}

function MetricsCells({ metrics }: { metrics: ProfitMetrics }) {
  return (
    <>
      <td>{money.format(metrics.revenue)}</td>
      <td>{money.format(metrics.totalCost)}</td>
      <td>{money.format(metrics.grossProfit)}</td>
      <td>{percent(metrics.grossMarginPercent)}</td>
      <td className={metrics.netProfit < 0 ? "is-negative" : "is-positive"}>
        {money.format(metrics.netProfit)}
      </td>
      <td className={metrics.netProfit < 0 ? "is-negative" : "is-positive"}>
        {percent(metrics.netMarginPercent)}
      </td>
    </>
  );
}

function ProfitResultsTable({
  report,
  view,
}: {
  report: ProfitMarginReport;
  view: ProfitMarginView;
}) {
  return (
    <div className="profit-table-wrap">
      <table className="profit-table" data-testid={`profit-${view}-table`}>
        <thead>
          <tr>
            <th>
              {view === "event"
                ? "Event"
                : view === "client"
                  ? "Client"
                  : "Period"}
            </th>
            {view === "event" ? <th>Client</th> : null}
            {view === "client" ? <th>Segment</th> : null}
            <th>Events</th>
            <th>Revenue</th>
            <th>Total cost</th>
            <th>Gross profit</th>
            <th>Gross margin</th>
            <th>Net profit</th>
            <th>Net margin</th>
          </tr>
        </thead>
        <tbody>
          {view === "event"
            ? report.events.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.title}</strong>
                    <small>
                      {day.format(row.date)} · {row.eventType}
                    </small>
                  </td>
                  <td>
                    {row.clientName}
                    <small>{row.segmentLabel}</small>
                  </td>
                  <td>{row.eventCount}</td>
                  <MetricsCells metrics={row} />
                </tr>
              ))
            : null}
          {view === "client"
            ? report.clients.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.clientName}</strong>
                  </td>
                  <td>{row.segmentLabel}</td>
                  <td>{row.eventCount}</td>
                  <MetricsCells metrics={row} />
                </tr>
              ))
            : null}
          {view === "period"
            ? report.periods.map((row) => (
                <tr key={row.key}>
                  <td>
                    <strong>{row.label}</strong>
                  </td>
                  <td>{row.eventCount}</td>
                  <MetricsCells metrics={row} />
                </tr>
              ))
            : null}
        </tbody>
      </table>
    </div>
  );
}

export function ProfitMarginDashboard({
  closeouts,
  events,
  clients,
  loading = false,
  now,
}: {
  closeouts: readonly ProfitMarginCloseout[];
  events: readonly ProfitMarginEvent[];
  clients: readonly ProfitMarginClient[];
  loading?: boolean;
  now: Date;
}) {
  const [granularity, setGranularity] =
    useState<ProfitMarginGranularity>("month");
  const [view, setView] = useState<ProfitMarginView>("event");
  const [rangeStart, setRangeStart] = useState(() =>
    dateInputValue(defaultStart(now)),
  );
  const [rangeEnd, setRangeEnd] = useState(() => dateInputValue(now));
  const validRange = Boolean(rangeStart && rangeEnd && rangeStart <= rangeEnd);
  const report = useMemo(
    () =>
      buildProfitMarginReport({
        closeouts,
        events,
        clients,
        granularity,
        rangeStart: new Date(`${rangeStart || "1970-01-01"}T00:00:00`),
        rangeEnd: new Date(`${rangeEnd || "1970-01-01"}T00:00:00`),
      }),
    [clients, closeouts, events, granularity, rangeEnd, rangeStart],
  );
  const rowCount = resultCount(report, view);
  const totalCost = Math.max(1, report.summary.totalCost);
  const costBuckets = [
    {
      key: "food",
      label: "Food",
      value: report.summary.foodCost,
    },
    {
      key: "labor",
      label: "Labor",
      value: report.summary.laborCost,
    },
    {
      key: "equipment",
      label: "Equipment",
      value: report.summary.equipmentCost,
    },
    {
      key: "overhead",
      label: "Overheads",
      value: report.summary.overheadCost,
    },
  ] as const;

  const downloadCsv = () => {
    const csv = buildProfitMarginCsv(report, view);
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profit-margins-${view}-${rangeStart}-to-${rangeEnd}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="operations-stage supply-stage profit-margin-stage">
      <header className="profit-margin-masthead">
        <div>
          <p className="eyebrow">Finance · Profit intelligence</p>
          <h1 className="display-title mt-2">Margin, plated.</h1>
          <p className="mt-3 max-w-180 text-ink-2">
            See what each event earned after food, labor, equipment, and
            overheads—then follow the pattern by client and season.
          </p>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={downloadCsv}
          disabled={!validRange || rowCount === 0}
          data-testid="profit-margin-export"
        >
          Export {view} CSV
        </button>
      </header>
      <FinanceWorkspaceNav />

      <section className="profit-margin-controls" aria-label="Report filters">
        <label>
          From
          <input
            className="input"
            type="date"
            value={rangeStart}
            max={rangeEnd}
            onChange={(event) => setRangeStart(event.target.value)}
          />
        </label>
        <label>
          Through
          <input
            className="input"
            type="date"
            value={rangeEnd}
            min={rangeStart}
            onChange={(event) => setRangeEnd(event.target.value)}
          />
        </label>
        <div>
          <span>Time periods</span>
          <div className="profit-switch">
            {(["month", "quarter"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="profit-range-stamp">
          <span>Closeout window</span>
          <strong>
            {validRange
              ? `${day.format(report.rangeStart)} — ${day.format(report.rangeEnd)}`
              : "Choose a valid range"}
          </strong>
        </div>
      </section>

      {!validRange ? (
        <p className="profit-range-error" role="alert">
          The start date must be on or before the end date.
        </p>
      ) : null}

      {loading ? (
        <section className="profit-margin-panel">
          <TableSkeleton rows={7} />
        </section>
      ) : (
        <>
          <section
            className="profit-margin-scorecard"
            aria-label="Profit summary"
          >
            <div>
              <span>Revenue</span>
              <strong data-testid="profit-total-revenue">
                {compactMoney.format(report.summary.revenue)}
              </strong>
              <small>{report.summary.eventCount} finalized events</small>
            </div>
            <div>
              <span>Gross margin</span>
              <strong data-testid="profit-gross-margin">
                {percent(report.summary.grossMarginPercent)}
              </strong>
              <small>
                {money.format(report.summary.grossProfit)} after food
              </small>
            </div>
            <div>
              <span>Total costs</span>
              <strong data-testid="profit-total-cost">
                {compactMoney.format(report.summary.totalCost)}
              </strong>
              <small>all four cost buckets</small>
            </div>
            <div
              className={
                report.summary.netProfit < 0 ? "is-negative" : "is-positive"
              }
            >
              <span>Net margin</span>
              <strong data-testid="profit-net-margin">
                {percent(report.summary.netMarginPercent)}
              </strong>
              <small>{money.format(report.summary.netProfit)} net profit</small>
            </div>
          </section>

          <section className="profit-cost-ledger">
            <div className="profit-section-heading">
              <div>
                <p className="eyebrow">Cost composition</p>
                <h2>Every dollar below gross</h2>
              </div>
              <strong>{money.format(report.summary.totalCost)}</strong>
            </div>
            <div className="profit-cost-band" aria-label="Cost distribution">
              {costBuckets.map((bucket) => (
                <i
                  key={bucket.key}
                  className={`is-${bucket.key}`}
                  style={{ width: `${(bucket.value / totalCost) * 100}%` }}
                  title={`${bucket.label}: ${money.format(bucket.value)}`}
                />
              ))}
            </div>
            <div className="profit-cost-legend">
              {costBuckets.map((bucket) => (
                <div key={bucket.key}>
                  <i className={`is-${bucket.key}`} aria-hidden="true" />
                  <span>{bucket.label}</span>
                  <strong>{money.format(bucket.value)}</strong>
                  <small>
                    {report.summary.totalCost === 0
                      ? "0%"
                      : `${((bucket.value / report.summary.totalCost) * 100).toFixed(1)}%`}
                  </small>
                </div>
              ))}
            </div>
          </section>

          <section
            className="profit-segment-panel"
            aria-label="Client segment profitability"
          >
            <div className="profit-section-heading">
              <div>
                <p className="eyebrow">Client segments</p>
                <h2>Who turns service into profit</h2>
              </div>
              <span>Ranked by net margin</span>
            </div>
            {report.segments.length === 0 ? (
              <div className="document-empty">
                <p>No client segments in this window.</p>
                <span>
                  Finalized closeouts appear here once events have revenue and
                  cost data.
                </span>
              </div>
            ) : (
              <div className="profit-segment-grid">
                <article className="is-best" data-testid="profit-best-segment">
                  <span>Most profitable segment</span>
                  <h3>{report.bestSegment?.label ?? "No revenue yet"}</h3>
                  <strong>
                    {percent(report.bestSegment?.netMarginPercent ?? null)}
                  </strong>
                  <small>
                    {money.format(report.bestSegment?.netProfit ?? 0)} across{" "}
                    {report.bestSegment?.eventCount ?? 0} events
                  </small>
                </article>
                <article
                  className="is-watch"
                  data-testid="profit-weakest-segment"
                >
                  <span>Least profitable segment</span>
                  <h3>{report.weakestSegment?.label ?? "No revenue yet"}</h3>
                  <strong>
                    {percent(report.weakestSegment?.netMarginPercent ?? null)}
                  </strong>
                  <small>
                    {money.format(report.weakestSegment?.netProfit ?? 0)} across{" "}
                    {report.weakestSegment?.eventCount ?? 0} events
                  </small>
                </article>
                <ol>
                  {report.segments.map((segment, index) => (
                    <li key={segment.key}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <div>
                        <strong>{segment.label}</strong>
                        <small>
                          {segment.eventCount} events ·{" "}
                          {money.format(segment.revenue)} revenue
                        </small>
                      </div>
                      <b>{percent(segment.netMarginPercent)}</b>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </section>

          <section className="profit-margin-panel">
            <div className="profit-results-heading">
              <div>
                <p className="eyebrow">Profit ledger</p>
                <h2>Read the margin your way</h2>
              </div>
              <div className="profit-view-switch" aria-label="Report grouping">
                {(["event", "client", "period"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={view === value}
                    onClick={() => setView(value)}
                  >
                    {value === "period" ? "Time period" : value}
                  </button>
                ))}
              </div>
            </div>
            {rowCount === 0 ? (
              <div className="document-empty">
                <p>No finalized profit data in this date range.</p>
                <span>
                  Adjust the window or finalize an event closeout with
                  reconciled numbers.
                </span>
              </div>
            ) : (
              <ProfitResultsTable report={report} view={view} />
            )}
          </section>
        </>
      )}

      <aside className="profit-method-note">
        <span className="eyebrow">Method</span>
        <p>
          Only finalized closeouts are included. Gross margin is revenue less
          food cost. Net margin is revenue less food, labor, equipment/vendor
          hire, and overhead/miscellaneous costs. The current closeout model
          stores waste and miscellaneous spend together; this report presents
          that bucket as overheads until a dedicated overhead ledger is modeled.
        </p>
        {report.excludedCloseoutCount > 0 ? (
          <p role="note">
            {report.excludedCloseoutCount} finalized closeout
            {report.excludedCloseoutCount === 1 ? " was" : "s were"} excluded
            because its event or reporting date was unavailable.
          </p>
        ) : null}
      </aside>
    </div>
  );
}

export function ProfitMarginReportsPage() {
  const closeouts = useListEventCloseout();
  const events = useListEvent();
  const clients = useListClient();
  const now = useMemo(() => new Date(), []);

  return (
    <ProfitMarginDashboard
      closeouts={(closeouts ?? []) as readonly ProfitMarginCloseout[]}
      events={(events ?? []) as readonly ProfitMarginEvent[]}
      clients={(clients ?? []) as readonly ProfitMarginClient[]}
      loading={
        closeouts === undefined || events === undefined || clients === undefined
      }
      now={now}
    />
  );
}
