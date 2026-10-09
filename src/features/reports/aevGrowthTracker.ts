import {
  GROWTH_GOAL,
  changePercent,
  isDelivered,
  isWon,
  monthPeriod,
  totals,
  winLoss,
  within,
  yearPeriod,
  type SalesEvent,
  type Totals,
} from "./mangia/salesFigures";

/**
 * The "Tracking & Accountability" part of the owner's Average Event Value
 * Growth Strategy (Avg_Event_Value_Strategy.html): a monthly average event
 * value tracker against the 10% growth goal, and a close-rate watch, because
 * "if avg event value goes up but close rate drops, you're just losing deals
 * at a higher price point". Counted with the Mangia sales report's record
 * sets (mangia/salesFigures.ts) so the pages agree:
 *   goal       = last year's delivered average x 1.10
 *   a month    = won events (delivered + booked) starting that month
 *   close rate = won / (won + lost) of events starting that month
 *   baseline   = last year's full-year close rate
 */

export interface TrackerMonth {
  readonly month: number;
  readonly won: Totals;
  /** Change of the month's average against the goal, in percent. */
  readonly vsGoal: number | null;
  /** Change against the same month last year, in percent. */
  readonly vsLastYear: number | null;
  readonly wonDeals: number;
  readonly lostDeals: number;
  readonly closeRate: number | null;
  /** True when the close rate is under last year's; null with nothing to compare. */
  readonly belowBaseline: boolean | null;
}

export interface AevGrowthTracker {
  readonly year: number;
  readonly baselineAev: number | null;
  readonly goal: number | null;
  readonly baselineCloseRate: number | null;
  /** January to this month, oldest first. */
  readonly months: readonly TrackerMonth[];
  /** The two finished months before this one were both under the baseline. */
  readonly closeRateWarning: boolean;
}

export function aevGrowthTracker(
  events: readonly SalesEvent[],
  now: Date,
): AevGrowthTracker {
  const year = now.getFullYear();
  const lastYear = within(events, yearPeriod(year - 1));
  const baselineAev = totals(lastYear.filter(isDelivered)).aev;
  const goal = baselineAev == null ? null : baselineAev * (1 + GROWTH_GOAL);
  const baselineCloseRate = winLoss(lastYear).winRate;

  const months: TrackerMonth[] = [];
  for (let month = 0; month <= now.getMonth(); month++) {
    const these = within(events, monthPeriod(year, month));
    const won = totals(these.filter(isWon));
    const before = totals(within(events, monthPeriod(year - 1, month), isWon));
    const decided = winLoss(these);
    months.push({
      month,
      won,
      vsGoal:
        won.aev == null || goal == null ? null : changePercent(won.aev, goal),
      vsLastYear:
        won.aev == null || before.aev == null
          ? null
          : changePercent(won.aev, before.aev),
      wonDeals: decided.won.events,
      lostDeals: decided.lost.events,
      closeRate: decided.winRate,
      belowBaseline:
        decided.winRate == null || baselineCloseRate == null
          ? null
          : decided.winRate < baselineCloseRate,
    });
  }

  const finished = months.slice(0, -1);
  const lastTwo = finished.slice(-2);
  return {
    year,
    baselineAev,
    goal,
    baselineCloseRate,
    months,
    closeRateWarning:
      lastTwo.length === 2 && lastTwo.every((m) => m.belowBaseline === true),
  };
}
