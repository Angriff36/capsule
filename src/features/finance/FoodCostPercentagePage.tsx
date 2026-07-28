import { useEffect, useMemo, useState } from "react";
import {
  useListEvent,
  useListEventCloseout,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { formatDate, formatMoney } from "../../lib/format";
import { FinanceWorkspaceNav } from "./FinanceWorkspaceNav";
import { ReportFilterBar } from "./ReportFilterBar";
import { useFinanceReportFilters } from "./useFinanceReportFilters";
import {
  buildFoodCostReport,
  type FoodCostCloseout,
  type FoodCostEvent,
  type FoodCostGranularity,
  type FoodCostPeriod,
  type FoodCostReport,
} from "./foodCostPercentage";
import "./FoodCostPercentagePage.css";

const TARGET_STORAGE_KEY = "capsule.finance.food-cost-target";

const compactMoney = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function initialTarget(): number {
  if (typeof window === "undefined") return 30;
  try {
    const stored = Number(window.localStorage.getItem(TARGET_STORAGE_KEY));
    return stored > 0 && stored <= 100 ? stored : 30;
  } catch {
    return 30;
  }
}

function percentage(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function variance(value: number | null): string {
  if (value == null) return "No revenue";
  if (Math.abs(value) < 0.05) return "On target";
  return `${Math.abs(value).toFixed(1)} pts ${value > 0 ? "over" : "under"}`;
}

function FoodCostTrend({
  periods,
  target,
}: {
  periods: FoodCostPeriod[];
  target: number;
}) {
  const width = 960;
  const height = 330;
  const plot = { left: 58, right: 24, top: 28, bottom: 58 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const maxRatio = Math.max(
    10,
    target * 1.25,
    ...periods.map((period) => period.percentage ?? 0),
  );
  const x = (index: number) =>
    plot.left +
    (periods.length === 1 ? 0 : (index / (periods.length - 1)) * plotWidth);
  const y = (value: number) =>
    plot.top + plotHeight - (value / maxRatio) * plotHeight;
  const path = periods.reduce((result, period, index) => {
    if (period.percentage == null) return result;
    const previousHasValue =
      index > 0 && periods[index - 1]?.percentage != null;
    return `${result}${previousHasValue ? " L" : " M"} ${x(index)} ${y(period.percentage)}`;
  }, "");

  return (
    <div className="food-cost-chart-scroll">
      <svg
        className="food-cost-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Food cost percentage by period compared with a ${target.toFixed(1)} percent target`}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((step) => {
          const value = maxRatio * step;
          return (
            <g key={step}>
              <line
                className="food-cost-gridline"
                x1={plot.left}
                x2={width - plot.right}
                y1={y(value)}
                y2={y(value)}
              />
              <text
                className="food-cost-axis-label"
                x={plot.left - 10}
                y={y(value) + 4}
                textAnchor="end"
              >
                {value.toFixed(0)}%
              </text>
            </g>
          );
        })}
        <line
          className="food-cost-target-line"
          x1={plot.left}
          x2={width - plot.right}
          y1={y(target)}
          y2={y(target)}
        />
        <text
          className="food-cost-target-label"
          x={width - plot.right}
          y={y(target) - 8}
          textAnchor="end"
        >
          target {target.toFixed(1)}%
        </text>
        {path ? (
          <path className="food-cost-trend-line" d={path.trim()} />
        ) : null}
        {periods.map((period, index) => (
          <g key={period.key}>
            <text
              className="food-cost-axis-label"
              x={x(index)}
              y={height - 25}
              textAnchor="middle"
            >
              {period.label}
            </text>
            {period.percentage == null ? null : (
              <circle
                className={period.aboveTarget ? "is-over" : "is-on-track"}
                cx={x(index)}
                cy={y(period.percentage)}
                r="6"
              >
                <title>
                  {period.label}: {percentage(period.percentage)} ·{" "}
                  {variance(period.variance)} target
                </title>
              </circle>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export function FoodCostPercentageDashboard({
  closeouts,
  events,
  venueMap,
  loading = false,
  now,
  venuePremiseFilter = "all",
}: {
  closeouts: readonly FoodCostCloseout[];
  events: readonly FoodCostEvent[];
  venueMap?: Map<string, boolean | null | undefined>;
  loading?: boolean;
  now: Date;
  venuePremiseFilter?: "on" | "off" | "all";
}) {
  const [granularity, setGranularity] = useState<FoodCostGranularity>("month");
  const [target, setTarget] = useState(initialTarget);

  // Filter events by venue premise
  const filteredEvents = useMemo(() => {
    if (!venueMap || venuePremiseFilter === "all") return events;

    return events.filter((event) => {
      if (!event.venueId) return false;

      const venueOnPremise = venueMap.get(String(event.venueId));
      if (venuePremiseFilter === "on") return venueOnPremise === true;
      if (venuePremiseFilter === "off") return venueOnPremise === false;
      return true;
    });
  }, [events, venueMap, venuePremiseFilter]);

  // Build filtered event IDs set for closeout filtering
  const filteredEventIds = useMemo(() => {
    return new Set(filteredEvents.map((e) => String(e._id)));
  }, [filteredEvents]);

  // Filter closeouts by filtered events
  const filteredCloseouts = useMemo(() => {
    if (venuePremiseFilter === "all") return closeouts;
    return closeouts.filter((c) => filteredEventIds.has(String(c.eventId)));
  }, [closeouts, filteredEventIds, venuePremiseFilter]);

  const report = useMemo(
    () =>
      buildFoodCostReport({
        closeouts: filteredCloseouts,
        events: filteredEvents,
        granularity,
        targetPercentage: target,
        now,
      }),
    [filteredCloseouts, filteredEvents, granularity, now, target],
  );
  const inclusiveRangeEnd = new Date(report.rangeEnd);
  inclusiveRangeEnd.setDate(inclusiveRangeEnd.getDate() - 1);

  useEffect(() => {
    try {
      window.localStorage.setItem(TARGET_STORAGE_KEY, String(target));
    } catch {
      // Storage can be unavailable in private or locked-down browser contexts.
    }
  }, [target]);

  return (
    <div className="operations-stage supply-stage food-cost-stage">
      <header className="supply-masthead food-cost-masthead">
        <div>
          <p className="eyebrow">Finance · Cost intelligence</p>
          <h1 className="display-title mt-2">Keep the plate in balance.</h1>
          <p className="mt-3 max-w-180 text-ink-2">
            See ingredient cost as a share of reconciled event revenue, follow
            the ratio over time, and spot periods drifting above target.
          </p>
        </div>
        <div
          className="food-cost-range-stamp"
          aria-label="Displayed date range"
        >
          <span>Service window</span>
          <strong>
            {formatDate(report.rangeStart.getTime())} —{" "}
            {formatDate(inclusiveRangeEnd.getTime())}
          </strong>
          <small>finalized closeouts only</small>
        </div>
      </header>
      <FinanceWorkspaceNav />

      <section
        className="food-cost-controls"
        aria-label="Food cost report controls"
      >
        <div>
          <span className="eyebrow">Period</span>
          <div className="food-cost-switch">
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
        <label className="food-cost-target-control">
          <span>Target food cost</span>
          <span className="food-cost-target-input">
            <input
              aria-label="Target food cost percentage"
              type="number"
              min="1"
              max="100"
              step="0.5"
              value={target}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next) && next >= 1 && next <= 100) {
                  setTarget(next);
                }
              }}
            />
            <b>%</b>
          </span>
          <small>Saved for this browser</small>
        </label>
      </section>

      {loading ? (
        <section className="food-cost-panel">
          <TableSkeleton rows={8} />
        </section>
      ) : (
        <FoodCostReportBody report={report} target={target} />
      )}

      <aside className="food-cost-method-note">
        <span className="eyebrow">Method</span>
        <p>
          Food cost percentage is finalized closeout ingredient cost divided by
          reconciled closeout revenue. Period totals divide summed cost by
          summed revenue—they do not average event percentages. Events land in
          the period when service starts; zero-revenue results remain unscored.
        </p>
      </aside>
    </div>
  );
}

function FoodCostReportBody({
  report,
  target,
}: {
  report: FoodCostReport;
  target: number;
}) {
  const onTrackCount = report.periods.filter(
    (period) => period.percentage != null && !period.aboveTarget,
  ).length;

  return (
    <>
      <section className="food-cost-scorecard" aria-label="Food cost summary">
        <div className={report.aboveTarget ? "is-over" : "is-on-track"}>
          <span>Window ratio</span>
          <strong data-testid="food-cost-window-ratio">
            {percentage(report.totalPercentage)}
          </strong>
          <small>{variance(report.totalVariance)} target</small>
        </div>
        <div>
          <span>Ingredient cost</span>
          <strong>{compactMoney.format(report.totalFoodCost)}</strong>
          <small>{report.events.length} finalized events</small>
        </div>
        <div>
          <span>Reconciled revenue</span>
          <strong>{compactMoney.format(report.totalRevenue)}</strong>
          <small>same closeout snapshots</small>
        </div>
        <div
          className={report.flaggedPeriodCount > 0 ? "is-over" : "is-on-track"}
        >
          <span>Period watch</span>
          <strong>{report.flaggedPeriodCount}</strong>
          <small>
            {report.flaggedPeriodCount > 0
              ? `above target · ${onTrackCount} on track`
              : `${onTrackCount} measured periods on track`}
          </small>
        </div>
      </section>

      <section className="food-cost-panel">
        <div className="food-cost-panel-heading">
          <div>
            <p className="eyebrow">Ratio trend</p>
            <h2>Cost pressure by period</h2>
          </div>
          <div className="food-cost-key" aria-hidden="true">
            <span>
              <i className="is-on-track" />
              At or below target
            </span>
            <span>
              <i className="is-over" />
              Above target
            </span>
          </div>
        </div>
        {report.events.length === 0 ? (
          <div className="document-empty">
            <p>No finalized event closeouts in this window.</p>
            <span>
              Ratios appear after an event closeout captures reconciled revenue
              and ingredient cost, then is finalized.
            </span>
          </div>
        ) : (
          <>
            <FoodCostTrend periods={report.periods} target={target} />
            <details className="food-cost-table-disclosure">
              <summary>View exact period values</summary>
              <div className="supply-table-wrap">
                <table className="supply-table">
                  <thead>
                    <tr>
                      <th>Period</th>
                      <th>Events</th>
                      <th>Food cost</th>
                      <th>Revenue</th>
                      <th>Ratio</th>
                      <th>Target variance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.periods.map((period) => (
                      <tr
                        key={period.key}
                        className={
                          period.aboveTarget ? "food-cost-row-over" : undefined
                        }
                      >
                        <td>{period.label}</td>
                        <td>{period.eventCount}</td>
                        <td>{formatMoney(period.foodCost)}</td>
                        <td>{formatMoney(period.revenue)}</td>
                        <td>
                          <strong>{percentage(period.percentage)}</strong>
                        </td>
                        <td>
                          <span
                            className={`food-cost-status ${period.aboveTarget ? "is-over" : "is-on-track"}`}
                          >
                            {variance(period.variance)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </section>

      <section className="food-cost-panel food-cost-event-panel">
        <div className="food-cost-panel-heading">
          <div>
            <p className="eyebrow">Event detail</p>
            <h2>Every plate, accounted for</h2>
          </div>
          <span>{report.events.length} events</span>
        </div>
        {report.events.length === 0 ? null : (
          <div className="supply-table-wrap">
            <table className="supply-table food-cost-event-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Service date</th>
                  <th>Food cost</th>
                  <th>Revenue</th>
                  <th>Ratio</th>
                  <th>Against target</th>
                </tr>
              </thead>
              <tbody>
                {report.events.map((event) => (
                  <tr
                    key={event.eventId}
                    className={
                      event.aboveTarget ? "food-cost-row-over" : undefined
                    }
                  >
                    <td>
                      <strong>{event.title}</strong>
                      <small>{event.eventType}</small>
                    </td>
                    <td>{formatDate(event.date.getTime())}</td>
                    <td>{formatMoney(event.foodCost)}</td>
                    <td>{formatMoney(event.revenue)}</td>
                    <td>
                      <strong>{percentage(event.percentage)}</strong>
                    </td>
                    <td>
                      <span
                        className={`food-cost-status ${event.aboveTarget ? "is-over" : "is-on-track"}`}
                      >
                        {variance(event.variance)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export function FoodCostPercentagePage() {
  const closeouts = useListEventCloseout();
  const events = useListEvent();
  const venues = useListVenue();
  const now = useMemo(() => new Date(), []);

  // Build venue lookup map for onPremise filtering
  const venueMap = useMemo(() => {
    const map = new Map<string, boolean | null | undefined>();
    for (const venue of venues ?? []) {
      if (venue._id && venue.onPremise !== undefined) {
        map.set(String(venue._id), venue.onPremise);
      }
    }
    return map;
  }, [venues]);

  return (
    <FoodCostPercentagePageWithFilters
      closeouts={closeouts ?? []}
      events={events ?? []}
      venueMap={venueMap}
      loading={closeouts === undefined || events === undefined}
      now={now}
    />
  );
}

function FoodCostPercentagePageWithFilters({
  closeouts,
  events,
  venueMap,
  loading,
  now,
}: {
  closeouts: readonly FoodCostCloseout[];
  events: readonly FoodCostEvent[];
  venueMap: Map<string, boolean | null | undefined>;
  loading: boolean;
  now: Date;
}) {
  const { filters } = useFinanceReportFilters();

  return (
    <>
      <ReportFilterBar
        showVenuePremise={true}
        showTarget={false}
        showView={false}
      />
      <FoodCostPercentageDashboard
        closeouts={closeouts}
        events={events}
        venueMap={venueMap}
        loading={loading}
        now={now}
        venuePremiseFilter={filters.venuePremise}
      />
    </>
  );
}
