import {
  COMPLETED_STAGES,
  isBookedEvent,
  isCompletedEvent,
  percentOf,
} from "../dashboardRecordSets";

/**
 * The Mangia Sales Performance Report (the "Round 4" sales dashboard Josh
 * gave Tim) counted from live events. The old report read TPP statuses; here
 * they are Capsule's own record sets (dashboardRecordSets.ts):
 *   delivered (TPP "Final")       = completed or closed out, priced above $0
 *   won (TPP "Final + Confirmed") = approved or later, with a price
 *   booked ahead (TPP "Confirmed")= won, not delivered yet
 *   open quote (TPP "Quote")      = quote or planning
 *   waiting (TPP "Sales Lock")    = waiting for approval
 *   lost (TPP "Lost"/"Cancelled") = cancelled
 * Every period is by event start date on this device's clock.
 */

export interface SalesEvent {
  readonly _id: string;
  readonly stage?: string | null;
  readonly quotedPrice?: number | null;
  readonly expectedHeadcount?: number | null;
  readonly startsAt?: number | null;
}

export interface SalesLabels<E> {
  readonly salesperson: (event: E) => string;
  readonly leadSource: (event: E) => string;
  readonly eventType: (event: E) => string;
  readonly serviceStyle: (event: E) => string;
  readonly venue: (event: E) => string;
}

export interface Totals {
  readonly events: number;
  readonly revenue: number;
  readonly guests: number;
  /** Average event value; null with no events. */
  readonly aev: number | null;
}

export interface Period {
  readonly from: number;
  /** Exclusive. */
  readonly to: number;
}

/** Months are divided by this to estimate a week, as the old report did. */
export const WEEKS_PER_MONTH = 4.3;
/** The company growth goal: average event value 10% above last year's. */
export const GROWTH_GOAL = 0.1;

export const isWon = (e: SalesEvent) => isBookedEvent(e);
export const isDelivered = (e: SalesEvent) => isCompletedEvent(e);
export const isBookedAhead = (e: SalesEvent) =>
  isWon(e) && !COMPLETED_STAGES.includes(e.stage ?? "");
export const isLost = (e: SalesEvent) => e.stage === "cancelled";
export const isOpenQuote = (e: SalesEvent) =>
  e.stage === "quote" || e.stage === "planning";
export const isWaiting = (e: SalesEvent) => e.stage === "pending_approval";
export const isOpen = (e: SalesEvent) => isOpenQuote(e) || isWaiting(e);

export function totals(events: readonly SalesEvent[]): Totals {
  let revenue = 0;
  let guests = 0;
  for (const e of events) {
    revenue += e.quotedPrice ?? 0;
    guests += e.expectedHeadcount ?? 0;
  }
  return {
    events: events.length,
    revenue,
    guests,
    aev: events.length > 0 ? revenue / events.length : null,
  };
}

export function yearPeriod(year: number): Period {
  return {
    from: new Date(year, 0, 1).getTime(),
    to: new Date(year + 1, 0, 1).getTime(),
  };
}

/** Jan 1 of `year` through the end of today's month and day in that year. */
export function ytdPeriod(now: Date, year: number): Period {
  return {
    from: new Date(year, 0, 1).getTime(),
    to: new Date(year, now.getMonth(), now.getDate() + 1).getTime(),
  };
}

export function monthPeriod(year: number, month: number): Period {
  return {
    from: new Date(year, month, 1).getTime(),
    to: new Date(year, month + 1, 1).getTime(),
  };
}

export function inPeriod(e: SalesEvent, period: Period): boolean {
  return (
    e.startsAt != null && e.startsAt >= period.from && e.startsAt < period.to
  );
}

export function within<E extends SalesEvent>(
  events: readonly E[],
  period: Period,
  test: (e: E) => boolean = () => true,
): E[] {
  return events.filter((e) => inPeriod(e, period) && test(e));
}

/** (now - before) / before as a percent; null when before is 0. */
export function changePercent(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

export function dayOfYear(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 1);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1;
}

export function daysInYear(year: number): number {
  return Math.round((yearPeriod(year).to - yearPeriod(year).from) / 86_400_000);
}

export interface WinLoss {
  readonly won: Totals;
  readonly lost: Totals;
  readonly decided: number;
  /** won / (won + lost), percent; null with nothing decided. */
  readonly winRate: number | null;
  /** lost revenue / won revenue, percent; null with nothing won. */
  readonly lossRatio: number | null;
}

export function winLoss(events: readonly SalesEvent[]): WinLoss {
  const won = totals(events.filter(isWon));
  const lost = totals(events.filter(isLost));
  const decided = won.events + lost.events;
  return {
    won,
    lost,
    decided,
    winRate: percentOf(won.events, decided),
    lossRatio: percentOf(lost.revenue, won.revenue),
  };
}

/** The years that have dated events, oldest first. */
export function yearsWithEvents(events: readonly SalesEvent[]): number[] {
  const years = new Set<number>();
  for (const e of events) {
    if (e.startsAt != null) years.add(new Date(e.startsAt).getFullYear());
  }
  return [...years].sort((a, b) => a - b);
}

export interface GroupRow extends WinLoss {
  readonly label: string;
  readonly all: number;
}

/** Win and loss figures per label (salesperson, lead source ...). */
export function groupWinLoss<E extends SalesEvent>(
  events: readonly E[],
  labelOf: (e: E) => string,
): GroupRow[] {
  const groups = new Map<string, E[]>();
  for (const e of events) {
    const label = labelOf(e);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  return [...groups.entries()]
    .map(([label, rows]) => ({ label, all: rows.length, ...winLoss(rows) }))
    .filter((row) => row.decided > 0)
    .sort((a, b) => b.won.revenue - a.won.revenue);
}

export interface TotalsRow extends Totals {
  readonly label: string;
  /** Share of all revenue in the table, percent. */
  readonly share: number | null;
}

/** Totals per label, biggest revenue first. */
export function groupTotals<E extends SalesEvent>(
  events: readonly E[],
  labelOf: (e: E) => string,
): TotalsRow[] {
  const groups = new Map<string, E[]>();
  for (const e of events) {
    const label = labelOf(e);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  const all = totals(events).revenue;
  return [...groups.entries()]
    .map(([label, rows]) => {
      const t = totals(rows);
      return { label, ...t, share: percentOf(t.revenue, all) };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface YearRow {
  readonly year: number;
  readonly all: Totals;
  readonly delivered: Totals;
  /** Delivered revenue change from the year before, percent. */
  readonly deliveredChange: number | null;
  /** Delivered average met last year's delivered average + 10%. */
  readonly goalMet: boolean | null;
  readonly statusCounts: Record<StatusColumn, number>;
}

export type StatusColumn =
  "delivered" | "booked" | "quote" | "waiting" | "lost";

export function statusColumn(e: SalesEvent): StatusColumn | null {
  if (isLost(e)) return "lost";
  if (isWaiting(e)) return "waiting";
  if (isOpenQuote(e)) return "quote";
  if (COMPLETED_STAGES.includes(e.stage ?? "")) return "delivered";
  if (isBookedAhead(e) || e.stage != null) return "booked";
  return null;
}

export function yearRows(events: readonly SalesEvent[]): YearRow[] {
  const rows: YearRow[] = [];
  for (const year of yearsWithEvents(events)) {
    const inYear = within(events, yearPeriod(year));
    const delivered = totals(inYear.filter(isDelivered));
    const before = rows[rows.length - 1];
    const statusCounts = {
      delivered: 0,
      booked: 0,
      quote: 0,
      waiting: 0,
      lost: 0,
    };
    for (const e of inYear) {
      const column = statusColumn(e);
      if (column) statusCounts[column] += 1;
    }
    rows.push({
      year,
      all: totals(inYear),
      delivered,
      deliveredChange:
        before?.year === year - 1
          ? changePercent(delivered.revenue, before.delivered.revenue)
          : null,
      goalMet:
        before?.year === year - 1 &&
        before.delivered.aev != null &&
        delivered.aev != null
          ? delivered.aev >= before.delivered.aev * (1 + GROWTH_GOAL)
          : null,
      statusCounts,
    });
  }
  return rows;
}

export interface MonthRow {
  readonly month: number;
  readonly byYear: readonly Totals[];
}

/** Delivered totals per calendar month, one column per year. */
export function monthRows(
  events: readonly SalesEvent[],
  years: readonly number[],
  test: (e: SalesEvent) => boolean = isDelivered,
): MonthRow[] {
  return Array.from({ length: 12 }, (_, month) => ({
    month,
    byYear: years.map((year) =>
      totals(within(events, monthPeriod(year, month), test)),
    ),
  }));
}

export interface QuarterRow extends Totals {
  readonly year: number;
  readonly quarter: number;
  /** Revenue change from the quarter before, percent. */
  readonly change: number | null;
}

/** Delivered totals per quarter for these years, up to the current quarter. */
export function quarterRows(
  events: readonly SalesEvent[],
  years: readonly number[],
  now: Date,
): QuarterRow[] {
  const rows: QuarterRow[] = [];
  for (const year of years) {
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const from = new Date(year, (quarter - 1) * 3, 1);
      if (from.getTime() > now.getTime()) break;
      const t = totals(
        within(
          events,
          {
            from: from.getTime(),
            to: new Date(year, quarter * 3, 1).getTime(),
          },
          isDelivered,
        ),
      );
      const before = rows[rows.length - 1];
      rows.push({
        year,
        quarter,
        ...t,
        change: before ? changePercent(t.revenue, before.revenue) : null,
      });
    }
  }
  return rows;
}

/** The last quarter that is over, as [year, quarter]. */
export function lastFullQuarter(now: Date): [number, number] {
  const current = Math.floor(now.getMonth() / 3) + 1;
  return current === 1
    ? [now.getFullYear() - 1, 4]
    : [now.getFullYear(), current - 1];
}

export function quarterPeriod(year: number, quarter: number): Period {
  return {
    from: new Date(year, (quarter - 1) * 3, 1).getTime(),
    to: new Date(year, quarter * 3, 1).getTime(),
  };
}

/** Annualized: value earned in `days` days, spread over a whole year. */
export function runRate(value: number, days: number, yearDays: number) {
  return days > 0 ? (value / days) * yearDays : 0;
}
