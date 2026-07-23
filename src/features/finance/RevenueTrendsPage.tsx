import { useMemo, useState } from "react";
import {
  useListClient,
  useListEvent,
  useListInvoice,
  useListOrganization,
} from "../../lib/manifest-convex-react";
import { normalizeCurrencyCode } from "../../lib/format";
import { formatCurrencyLabel } from "../../lib/currency";
import { TableSkeleton } from "../../ui/primitives";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import {
  buildRevenueTrend,
  type RevenueBreakdown,
  type RevenueCategory,
  type RevenueClient,
  type RevenueEvent,
  type RevenueGranularity,
  type RevenueInvoice,
  type RevenuePeriod,
  type RevenueTrend,
} from "./revenueTrend";

const CATEGORY_COLORS = [
  "#31574f",
  "#c8783f",
  "#40598a",
  "#8a641c",
  "#7c4b67",
] as const;

// Reports render totals already folded into the tenant's functional currency,
// so the formatter is keyed on that code. Cached so re-renders reuse formatters.
const compactMoneyCache = new Map<string, Intl.NumberFormat>();
const moneyCache = new Map<string, Intl.NumberFormat>();

function compactMoneyFmt(currencyCode: string): Intl.NumberFormat {
  let fmt = compactMoneyCache.get(currencyCode);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      notation: "compact",
      maximumFractionDigits: 1,
    });
    compactMoneyCache.set(currencyCode, fmt);
  }
  return fmt;
}

function moneyFmt(currencyCode: string): Intl.NumberFormat {
  let fmt = moneyCache.get(currencyCode);
  if (!fmt) {
    fmt = new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode,
      maximumFractionDigits: 0,
    });
    moneyCache.set(currencyCode, fmt);
  }
  return fmt;
}

const dateRange = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function chartCategories(categories: RevenueCategory[]): RevenueCategory[] {
  if (categories.length <= CATEGORY_COLORS.length) return categories;
  const leading = categories.slice(0, CATEGORY_COLORS.length - 1);
  const remainder = categories.slice(CATEGORY_COLORS.length - 1);
  return [
    ...leading,
    {
      key: "__other__",
      label: "Other",
      currentTotal: remainder.reduce(
        (sum, category) => sum + category.currentTotal,
        0,
      ),
      priorTotal: remainder.reduce(
        (sum, category) => sum + category.priorTotal,
        0,
      ),
    },
  ];
}

function periodCategoryValue(
  period: RevenuePeriod,
  category: RevenueCategory,
  visibleCategories: RevenueCategory[],
): number {
  if (category.key !== "__other__") {
    return period.currentByCategory[category.key] ?? 0;
  }
  const visibleKeys = new Set(
    visibleCategories
      .filter((item) => item.key !== "__other__")
      .map((item) => item.key),
  );
  return Object.entries(period.currentByCategory).reduce(
    (sum, [key, value]) => sum + (visibleKeys.has(key) ? 0 : value),
    0,
  );
}

function RevenueBars({
  trend,
  currencyCode,
}: {
  trend: RevenueTrend;
  currencyCode: string;
}) {
  const money = moneyFmt(currencyCode);
  const compactMoney = compactMoneyFmt(currencyCode);
  const width = 960;
  const height = 340;
  const plot = { left: 66, right: 20, top: 26, bottom: 56 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maxValue = Math.max(
    1,
    ...trend.periods.flatMap((period) => [
      period.currentTotal,
      period.priorTotal,
    ]),
  );
  const visibleCategories = chartCategories(trend.categories);
  const band = plotWidth / trend.periods.length;
  const barWidth = Math.min(24, band * 0.32);
  const y = (value: number) =>
    plot.top + plotHeight - (value / maxValue) * plotHeight;

  return (
    <div className="revenue-chart-scroll">
      <svg
        className="revenue-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Invoice revenue by period. Filled stacked bars show current revenue and outlined bars show the same periods in the prior year."
      >
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = maxValue * ratio;
          const lineY = y(value);
          return (
            <g key={ratio}>
              <line
                x1={plot.left}
                x2={width - plot.right}
                y1={lineY}
                y2={lineY}
                className="revenue-gridline"
              />
              <text
                x={plot.left - 10}
                y={lineY + 4}
                textAnchor="end"
                className="revenue-axis-label"
              >
                {compactMoney.format(value)}
              </text>
            </g>
          );
        })}
        {trend.periods.map((period, periodIndex) => {
          const center = plot.left + band * periodIndex + band / 2;
          const priorHeight = (period.priorTotal / maxValue) * plotHeight;
          let stackedValue = 0;
          return (
            <g key={period.key}>
              <title>
                {period.label}: {money.format(period.currentTotal)} current;{" "}
                {money.format(period.priorTotal)} prior year
              </title>
              <rect
                x={center - barWidth - 3}
                y={plot.top + plotHeight - priorHeight}
                width={barWidth}
                height={priorHeight}
                rx="2"
                className="revenue-prior-bar"
              />
              {visibleCategories.map((category, categoryIndex) => {
                const value = periodCategoryValue(
                  period,
                  category,
                  visibleCategories,
                );
                const segmentHeight = (value / maxValue) * plotHeight;
                const segmentY = y(stackedValue + value);
                stackedValue += value;
                return value > 0 ? (
                  <rect
                    key={category.key}
                    x={center + 3}
                    y={segmentY}
                    width={barWidth}
                    height={segmentHeight}
                    fill={CATEGORY_COLORS[categoryIndex]}
                  >
                    <title>
                      {category.label}: {money.format(value)}
                    </title>
                  </rect>
                ) : null;
              })}
              <text
                x={center}
                y={height - 25}
                textAnchor="middle"
                className="revenue-axis-label"
              >
                {period.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function RevenueLegend({
  categories,
  currencyCode,
}: {
  categories: RevenueCategory[];
  currencyCode: string;
}) {
  const compactMoney = compactMoneyFmt(currencyCode);
  const visible = chartCategories(categories);
  return (
    <div className="revenue-legend" aria-label="Revenue breakdown legend">
      {visible.map((category, index) => (
        <div key={category.key}>
          <i
            style={{ background: CATEGORY_COLORS[index] }}
            aria-hidden="true"
          />
          <span>{category.label}</span>
          <strong>{compactMoney.format(category.currentTotal)}</strong>
        </div>
      ))}
      <div className="revenue-legend-prior">
        <i aria-hidden="true" />
        <span>Prior year total</span>
      </div>
    </div>
  );
}

function RevenueTable({
  trend,
  currencyCode,
}: {
  trend: RevenueTrend;
  currencyCode: string;
}) {
  const money = moneyFmt(currencyCode);
  return (
    <details className="revenue-table-disclosure">
      <summary>View exact period values</summary>
      <div className="supply-table-wrap">
        <table className="supply-table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Current</th>
              <th>Prior year</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {trend.periods.map((period) => {
              const change =
                period.priorTotal === 0
                  ? null
                  : ((period.currentTotal - period.priorTotal) /
                      period.priorTotal) *
                    100;
              return (
                <tr key={period.key}>
                  <td>{period.label}</td>
                  <td>{money.format(period.currentTotal)}</td>
                  <td>{money.format(period.priorTotal)}</td>
                  <td>
                    {change == null
                      ? "—"
                      : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function RevenueTrendsDashboard({
  invoices,
  clients,
  events,
  functionalCurrencyCode,
  loading = false,
  now,
}: {
  invoices: readonly RevenueInvoice[];
  clients: readonly RevenueClient[];
  events: readonly RevenueEvent[];
  functionalCurrencyCode: string;
  loading?: boolean;
  now: Date;
}) {
  const [granularity, setGranularity] = useState<RevenueGranularity>("month");
  const [breakdown, setBreakdown] = useState<RevenueBreakdown>("event_type");
  const compactMoney = compactMoneyFmt(functionalCurrencyCode);
  const trend = useMemo(
    () =>
      buildRevenueTrend({
        invoices,
        clients,
        events,
        granularity,
        breakdown,
        functionalCurrencyCode,
        now,
      }),
    [
      breakdown,
      clients,
      events,
      functionalCurrencyCode,
      granularity,
      invoices,
      now,
    ],
  );
  const rangeEnd = new Date(trend.rangeEnd);
  rangeEnd.setDate(rangeEnd.getDate() - 1);
  const averageInvoice =
    trend.currentInvoiceCount === 0
      ? 0
      : trend.currentTotal / trend.currentInvoiceCount;

  return (
    <div className="operations-stage supply-stage revenue-stage">
      <header className="supply-masthead revenue-masthead">
        <div>
          <p className="eyebrow">Finance · Revenue intelligence</p>
          <h1 className="display-title mt-2">Revenue, in season.</h1>
          <p className="mt-3 max-w-180 text-ink-2">
            Follow issued invoice revenue through the calendar, see who and what
            drives it, and compare every period with the same time last year.
          </p>
        </div>
        <div className="revenue-period-stamp" aria-label="Displayed date range">
          <span>Rolling window</span>
          <strong>
            {dateRange.format(trend.rangeStart)} — {dateRange.format(rangeEnd)}
          </strong>
        </div>
      </header>
      <FinanceWorkspaceNav />

      <section className="revenue-controls" aria-label="Revenue chart controls">
        <div>
          <span className="eyebrow">Period</span>
          <div className="revenue-switch">
            {(["week", "month", "quarter"] as const).map((value) => (
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
        <label className="field-label revenue-breakdown">
          Break down by
          <select
            className="input"
            value={breakdown}
            onChange={(event) =>
              setBreakdown(event.target.value as RevenueBreakdown)
            }
          >
            <option value="event_type">Event type</option>
            <option value="client">Client</option>
            <option value="service_line">Service line</option>
          </select>
        </label>
      </section>

      {loading ? (
        <section className="revenue-panel">
          <TableSkeleton rows={8} />
        </section>
      ) : (
        <>
          <section className="revenue-scorecard" aria-label="Revenue summary">
            <div className="revenue-scorecard-lead">
              <span>
                Current window · {formatCurrencyLabel(functionalCurrencyCode)}
              </span>
              <strong>{compactMoney.format(trend.currentTotal)}</strong>
              <small>
                {trend.currentInvoiceCount} issued invoice
                {trend.currentInvoiceCount === 1 ? "" : "s"}
                {trend.foreignCurrencyInvoiceCount > 0
                  ? ` · ${trend.foreignCurrencyInvoiceCount} in other currencies`
                  : ""}
              </small>
            </div>
            <div>
              <span>Prior-year window</span>
              <strong>{compactMoney.format(trend.priorTotal)}</strong>
              <small>same calendar periods</small>
            </div>
            <div>
              <span>Year-over-year</span>
              <strong
                className={
                  trend.changePercent != null && trend.changePercent < 0
                    ? "is-negative"
                    : "is-positive"
                }
              >
                {trend.changePercent == null
                  ? "—"
                  : `${trend.changePercent >= 0 ? "+" : ""}${trend.changePercent.toFixed(1)}%`}
              </strong>
              <small>
                {trend.changePercent == null
                  ? "no prior revenue to compare"
                  : "versus the prior year"}
              </small>
            </div>
            <div>
              <span>Average invoice</span>
              <strong>{compactMoney.format(averageInvoice)}</strong>
              <small>in the current window</small>
            </div>
          </section>

          <section className="revenue-panel">
            <div className="revenue-panel-heading">
              <div>
                <p className="eyebrow">Billed revenue</p>
                <h2>Current pace vs. last year</h2>
              </div>
              <div className="revenue-bar-key" aria-hidden="true">
                <span>
                  <i className="is-filled" />
                  Current
                </span>
                <span>
                  <i />
                  Prior year
                </span>
              </div>
            </div>
            {trend.currentTotal === 0 && trend.priorTotal === 0 ? (
              <div className="document-empty">
                <p>No issued invoice revenue in this comparison window.</p>
                <span>
                  Revenue appears here as invoices are issued. Voided,
                  written-off, and deleted invoices are excluded.
                </span>
              </div>
            ) : (
              <>
                <RevenueBars
                  trend={trend}
                  currencyCode={functionalCurrencyCode}
                />
                <RevenueLegend
                  categories={trend.categories}
                  currencyCode={functionalCurrencyCode}
                />
                <RevenueTable
                  trend={trend}
                  currencyCode={functionalCurrencyCode}
                />
              </>
            )}
          </section>
        </>
      )}

      <aside className="revenue-method-note">
        <span className="eyebrow">Method</span>
        <p>
          Revenue uses invoice total on the issued date, with created date as a
          legacy fallback. Voided, written-off, and deleted invoices are left
          out. Prior-year weekly comparisons use the same weekday-aligned week.
        </p>
        {breakdown === "service_line" ? (
          <p role="note">
            Invoices currently store one summary service line, so all revenue is
            shown as <strong>Catering services</strong>. More service-line
            detail will appear when invoice line items are modeled.
          </p>
        ) : null}
      </aside>
    </div>
  );
}

export function RevenueTrendsPage() {
  const invoices = useListInvoice();
  const clients = useListClient();
  const events = useListEvent();
  const organizations = useListOrganization();
  const now = useMemo(() => new Date(), []);
  const functionalCurrencyCode = normalizeCurrencyCode(
    organizations?.find((row) => row.deletedAt == null)?.defaultCurrencyCode,
    "USD",
  );

  return (
    <RevenueTrendsDashboard
      invoices={invoices ?? []}
      clients={clients ?? []}
      events={events ?? []}
      functionalCurrencyCode={functionalCurrencyCode}
      loading={
        invoices === undefined ||
        clients === undefined ||
        events === undefined ||
        organizations === undefined
      }
      now={now}
    />
  );
}
