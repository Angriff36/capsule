import { weekStartOf } from "./leadershipHistory";

/**
 * The periods a scorecard number is counted over, on this device's clock.
 * The owner's scorecard is weekly (Monday to Sunday, reviewed at the L10);
 * a few of its numbers are per month or per quarter, and some are a count of
 * what is on file today.
 */
export type ScorecardPeriod = "week" | "month" | "quarter" | "now";

export interface PeriodWindow {
  readonly from: number;
  /** Exclusive. */
  readonly to: number;
  /** Short name for a trend point: "Oct 6", "Oct", "Q4", "Today". */
  readonly label: string;
}

/** How many past periods the trend shows, this one included. */
export const TREND_LENGTH: Record<ScorecardPeriod, number> = {
  week: 12,
  month: 6,
  quarter: 4,
  now: 1,
};

/** "this week", "this month", ... for card wording. */
export const PERIOD_NAME: Record<ScorecardPeriod, string> = {
  week: "week",
  month: "month",
  quarter: "quarter",
  now: "today",
};

const at = (y: number, m: number, d: number) => new Date(y, m, d).getTime();

/** The period holding `ref`, moved `back` periods into the past. */
export function periodWindow(
  period: ScorecardPeriod,
  ref: Date,
  back = 0,
): PeriodWindow {
  if (period === "week") {
    const monday = weekStartOf(ref);
    const from = at(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() - 7 * back,
    );
    const start = new Date(from);
    return {
      from,
      to: at(start.getFullYear(), start.getMonth(), start.getDate() + 7),
      label: start.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
    };
  }
  if (period === "month") {
    const from = at(ref.getFullYear(), ref.getMonth() - back, 1);
    const start = new Date(from);
    return {
      from,
      to: at(start.getFullYear(), start.getMonth() + 1, 1),
      label: start.toLocaleDateString("en-US", { month: "short" }),
    };
  }
  if (period === "quarter") {
    const firstMonth = Math.floor(ref.getMonth() / 3) * 3 - 3 * back;
    const from = at(ref.getFullYear(), firstMonth, 1);
    const start = new Date(from);
    return {
      from,
      to: at(start.getFullYear(), start.getMonth() + 3, 1),
      label: `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`,
    };
  }
  const end = ref.getTime() + 1;
  return { from: end, to: end, label: "Today" };
}

/** The trend's periods, oldest first, ending with the one holding `ref`. */
export function trendWindows(
  period: ScorecardPeriod,
  ref: Date,
): PeriodWindow[] {
  const windows: PeriodWindow[] = [];
  for (let back = TREND_LENGTH[period] - 1; back >= 0; back--) {
    windows.push(periodWindow(period, ref, back));
  }
  return windows;
}

/** The earliest moment any scorecard trend reaches back to. */
export function earliestTrendStart(ref: Date): number {
  return Math.min(
    ...(["week", "month", "quarter"] as const).map(
      (period) => periodWindow(period, ref, TREND_LENGTH[period] - 1).from,
    ),
  );
}

export function inWindow(
  ts: number | null | undefined,
  window: { from: number; to: number },
): boolean {
  return ts != null && ts >= window.from && ts < window.to;
}
