import { percentOf } from "./dashboardRecordSets";
import {
  GROWTH_GOAL,
  isLost,
  isOpen,
  isWaiting,
  isWon,
  winLoss,
  type SalesEvent,
} from "./mangia/salesFigures";

/**
 * The company sales funnel (owner's Banani "Sales Funnel & KPIs" screen,
 * 2026-10-14), counted from live events the way Tim's sales report counts
 * them (mangia/salesFigures.ts). Every event is an inquiry; a priced one is a
 * quote; approved or later is won; cancelled is lost. Periods go by event
 * start date, like the rest of the sales report.
 */

export const DAY_MS = 86_400_000;

export interface FunnelEvent extends SalesEvent {
  readonly title?: string | null;
  readonly assignedToId?: string | null;
  readonly referralSourceId?: string | null;
  readonly createdAt?: number | null;
  readonly cancellationReason?: string | null;
  readonly deletedAt?: number | null;
}

export type PeriodKey = "week" | "month" | "quarter" | "year";

export const PERIODS: readonly { key: PeriodKey; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

export interface Range {
  readonly from: number;
  readonly to: number;
}

/** The calendar week (Monday on), month, quarter or year holding `now`. */
export function periodRange(key: PeriodKey, now: Date): Range {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === "week") {
    const start = new Date(y, m, now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start.getTime(), to: end.getTime() };
  }
  if (key === "month")
    return {
      from: new Date(y, m, 1).getTime(),
      to: new Date(y, m + 1, 1).getTime(),
    };
  if (key === "quarter") {
    const q = Math.floor(m / 3) * 3;
    return {
      from: new Date(y, q, 1).getTime(),
      to: new Date(y, q + 3, 1).getTime(),
    };
  }
  return {
    from: new Date(y, 0, 1).getTime(),
    to: new Date(y + 1, 0, 1).getTime(),
  };
}

/** The same dates one year earlier. */
export function yearBefore(range: Range): Range {
  const back = (time: number) => {
    const d = new Date(time);
    d.setFullYear(d.getFullYear() - 1);
    return d.getTime();
  };
  return { from: back(range.from), to: back(range.to) };
}

export function inRange<E extends SalesEvent>(
  events: readonly E[],
  range: Range,
): E[] {
  return events.filter(
    (e) =>
      e.startsAt != null && e.startsAt >= range.from && e.startsAt < range.to,
  );
}

const revenue = (events: readonly SalesEvent[]) =>
  events.reduce((sum, e) => sum + (e.quotedPrice ?? 0), 0);

export interface FunnelStage {
  readonly key: "inquiries" | "quoted" | "won" | "lost";
  readonly label: string;
  readonly count: number;
  readonly value: number;
  /** Share of the stage it comes from, percent; null when that is empty. */
  readonly share: number | null;
  readonly shareOf: string | null;
}

const isQuoted = (e: SalesEvent) =>
  (e.quotedPrice ?? 0) > 0 || isWaiting(e) || isWon(e);

export function funnelStages(events: readonly SalesEvent[]): FunnelStage[] {
  const quoted = events.filter(isQuoted);
  const won = events.filter(isWon);
  const lost = events.filter(isLost);
  return [
    {
      key: "inquiries",
      label: "Inquiries",
      count: events.length,
      value: revenue(events),
      share: events.length ? 100 : null,
      shareOf: null,
    },
    {
      key: "quoted",
      label: "Quoted",
      count: quoted.length,
      value: revenue(quoted),
      share: percentOf(quoted.length, events.length),
      shareOf: "of inquiries",
    },
    {
      key: "won",
      label: "Closed won",
      count: won.length,
      value: revenue(won),
      share: percentOf(won.length, quoted.length),
      shareOf: "of quoted",
    },
    {
      key: "lost",
      label: "Closed lost",
      count: lost.length,
      value: revenue(lost),
      share: percentOf(lost.length, quoted.length),
      shareOf: "of quoted",
    },
  ];
}

export interface FunnelKpis {
  readonly openCount: number;
  readonly openValue: number;
  readonly winRate: number | null;
  /** Average days from the inquiry to the event, for won events. */
  readonly daysAhead: number | null;
  readonly averageWon: number | null;
}

export function funnelKpis(events: readonly FunnelEvent[]): FunnelKpis {
  const open = events.filter(isOpen);
  const won = events.filter(isWon);
  const leads = won
    .filter((e) => e.createdAt != null && e.startsAt != null)
    .map((e) => (Number(e.startsAt) - Number(e.createdAt)) / DAY_MS)
    .filter((days) => days >= 0);
  return {
    openCount: open.length,
    openValue: revenue(open),
    winRate: winLoss(events).winRate,
    daysAhead: leads.length
      ? Math.round(leads.reduce((a, b) => a + b, 0) / leads.length)
      : null,
    averageWon: won.length ? revenue(won) / won.length : null,
  };
}

export interface SalespersonRow {
  readonly id: string;
  readonly name: string;
  readonly wonValue: number;
  readonly winRate: number | null;
  readonly openCount: number;
  readonly openValue: number;
  /** Share of the company's won revenue, percent. */
  readonly share: number | null;
}

export function bySalesperson(
  events: readonly FunnelEvent[],
  nameOf: (id: string) => string,
): SalespersonRow[] {
  const groups = new Map<string, FunnelEvent[]>();
  for (const e of events) {
    const id = e.assignedToId ? String(e.assignedToId) : "";
    groups.set(id, [...(groups.get(id) ?? []), e]);
  }
  const companyWon = revenue(events.filter(isWon));
  return [...groups.entries()]
    .map(([id, rows]) => {
      const won = revenue(rows.filter(isWon));
      const open = rows.filter(isOpen);
      return {
        id,
        name: id ? nameOf(id) : "No salesperson",
        wonValue: won,
        winRate: winLoss(rows).winRate,
        openCount: open.length,
        openValue: revenue(open),
        share: percentOf(won, companyWon),
      };
    })
    .sort((a, b) => b.wonValue - a.wonValue || b.openValue - a.openValue);
}

export interface GoalTile {
  readonly key: PeriodKey;
  readonly label: string;
  readonly won: number;
  readonly lastYear: number;
  /** Last year plus the 10% growth goal; null with no last-year figure. */
  readonly goal: number | null;
  readonly toGoal: number | null;
}

export function goalTiles(
  events: readonly SalesEvent[],
  lastYearEvents: readonly SalesEvent[],
  now: Date,
): GoalTile[] {
  return PERIODS.map(({ key, label }) => {
    const range = periodRange(key, now);
    const won = revenue(inRange(events, range).filter(isWon));
    const before = revenue(
      inRange(lastYearEvents, yearBefore(range)).filter(isWon),
    );
    const goal = before > 0 ? before * (1 + GROWTH_GOAL) : null;
    return {
      key,
      label,
      won,
      lastYear: before,
      goal,
      toGoal: goal ? percentOf(won, goal) : null,
    };
  });
}

export interface ReasonRow {
  readonly reason: string;
  readonly count: number;
  readonly share: number | null;
}

/** Why lost events were lost, as written on the cancellation. */
export function lossReasons(events: readonly FunnelEvent[]): ReasonRow[] {
  const lost = events.filter(isLost);
  const counts = new Map<string, number>();
  for (const e of lost) {
    const text = e.cancellationReason?.trim() || "No reason written";
    const key = text.charAt(0).toUpperCase() + text.slice(1);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({
      reason,
      count,
      share: percentOf(count, lost.length),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
