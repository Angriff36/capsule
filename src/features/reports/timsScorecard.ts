import {
  changePercent,
  isBookedAhead,
  isDelivered,
  isLost,
  isOpen,
  isOpenQuote,
  isWaiting,
  totals,
  winLoss,
  within,
  yearPeriod,
  ytdPeriod,
  type SalesEvent,
  type Totals,
} from "./mangia/salesFigures";
import type { MetricId } from "./metricDefinitions";

/**
 * Tim's KPIs, copied from the owner's written research: the "Mangia Catering
 * Co — L10 Sales Scorecard" (Mangia_Sales_Report_EOS.html, data as of April
 * 17, 2026), the weekly Level 10 scorecard made for Tim. Each KPI below keeps
 * the scorecard's own name and rule; docs/reporting/tims-kpi-definitions.md
 * records the same list. Counting uses the Mangia sales report's record sets
 * (mangia/salesFigures.ts), so the two pages agree.
 */

export const TIMS_SCORECARD_SOURCE =
  "Mangia Catering Co — L10 Sales Scorecard (data as of April 17, 2026)";

/** A quote counts at half its value in the weighted forecast. */
export const QUOTE_WEIGHT = 0.5;

export type TimsKpiId =
  | "ytd_revenue"
  | "ytd_events"
  | "ytd_aev"
  | "win_rate"
  | "pipeline_value"
  | "weighted_forecast"
  | "confirmed_value"
  | "lost_ytd";

export interface TimsKpiDefinition {
  readonly id: TimsKpiId;
  /** The card title on Tim's KPIs. */
  readonly title: string;
  /** The card name on the L10 Sales Scorecard. */
  readonly scorecardLabel: string;
  /** What the scorecard counts, in its own terms. */
  readonly scorecardRule: string;
  /** The figure meaning shown under "How these numbers are counted". */
  readonly metricId: MetricId;
}

export const TIMS_KPIS: readonly TimsKpiDefinition[] = [
  {
    id: "ytd_revenue",
    title: "Revenue this year",
    scorecardLabel: "YTD Revenue",
    scorecardRule:
      "Revenue of delivered (TPP Final) events dated Jan 1 to today, against last year's same dates.",
    metricId: "dashboard.completed_revenue",
  },
  {
    id: "ytd_events",
    title: "Events this year",
    scorecardLabel: "YTD Events",
    scorecardRule:
      "Delivered events dated Jan 1 to today, against last year's same dates.",
    metricId: "dashboard.completed_events",
  },
  {
    id: "ytd_aev",
    title: "Avg event value this year",
    scorecardLabel: "AEV (YTD)",
    scorecardRule:
      "YTD revenue divided by YTD events, against last year's same dates.",
    metricId: "dashboard.completed_average",
  },
  {
    id: "win_rate",
    title: "Win rate this year",
    scorecardLabel: "Win Rate (YTD)",
    scorecardRule:
      "Won deals divided by decided deals dated this year (later dates included); the scorecard marks 60% or more as on track.",
    metricId: "dashboard.win_rate",
  },
  {
    id: "pipeline_value",
    title: "Pipeline value",
    scorecardLabel: "Pipeline Value",
    scorecardRule: "Value of the open deals on file today, and how many.",
    metricId: "dashboard.pipeline_value",
  },
  {
    id: "weighted_forecast",
    title: "Weighted forecast",
    scorecardLabel: "Weighted Forecast",
    scorecardRule: "Confirmed events at 100% plus open quotes at 50%.",
    metricId: "dashboard.weighted_forecast",
  },
  {
    id: "confirmed_value",
    title: "Confirmed, not yet delivered",
    scorecardLabel: "Confirmed Value",
    scorecardRule: "Value of confirmed events not delivered yet, and how many.",
    metricId: "dashboard.booked_ahead",
  },
  {
    id: "lost_ytd",
    title: "Lost this year",
    scorecardLabel: "Lost YTD",
    scorecardRule: "Value of deals lost this year, and how many.",
    metricId: "dashboard.lost_revenue",
  },
];

/** The scorecard's on-track line for the win rate. */
export const WIN_RATE_ON_TRACK = 60;

export interface TimsScorecard {
  readonly ytd: Totals;
  readonly lastYtd: Totals;
  readonly revenueChange: number | null;
  readonly eventsChange: number | null;
  readonly aevChange: number | null;
  readonly won: number;
  readonly decided: number;
  readonly winRate: number | null;
  readonly pipeline: Totals;
  readonly confirmed: Totals;
  readonly quotes: Totals;
  readonly weightedForecast: number;
  readonly lost: Totals;
}

export function timsScorecard(
  events: readonly SalesEvent[],
  now: Date,
): TimsScorecard {
  const year = now.getFullYear();
  const ytd = totals(within(events, ytdPeriod(now, year), isDelivered));
  const lastYtd = totals(within(events, ytdPeriod(now, year - 1), isDelivered));
  // The scorecard's "59 won" is more than its 40 delivered events: won and
  // lost count every event dated this year, later dates included.
  const thisYear = within(events, yearPeriod(year));
  const decisions = winLoss(thisYear);
  const confirmed = totals(events.filter(isBookedAhead));
  // Waiting for approval is still a quote the client has not said yes to.
  const quotes = totals(events.filter((e) => isOpenQuote(e) || isWaiting(e)));
  return {
    ytd,
    lastYtd,
    revenueChange: changePercent(ytd.revenue, lastYtd.revenue),
    eventsChange: changePercent(ytd.events, lastYtd.events),
    aevChange:
      ytd.aev == null || lastYtd.aev == null
        ? null
        : changePercent(ytd.aev, lastYtd.aev),
    won: decisions.won.events,
    decided: decisions.decided,
    winRate: decisions.winRate,
    pipeline: totals(events.filter(isOpen)),
    confirmed,
    quotes,
    weightedForecast: confirmed.revenue + quotes.revenue * QUOTE_WEIGHT,
    lost: totals(thisYear.filter(isLost)),
  };
}
