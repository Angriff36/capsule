import { formatCount, formatMoney, formatPercent } from "@/lib/format";
import {
  COMPLETED_STAGES,
  foodCostPercent,
  isBookedEvent,
  isConvertedLead,
  percentOf,
  profitMarginPercent,
} from "./dashboardRecordSets";
import type { MetricId } from "./metricDefinitions";

/**
 * The company scorecard numbers (spec §7.4). Each one is counted live per
 * calendar month on this device's clock, then compared with its target
 * (ScorecardTarget) to give on track / off track. The Company Scorecard and
 * the L10 page both read these rows, so the two pages always agree.
 */

export type ScorecardUnit = "currency" | "percent" | "count";
export type ScorecardDirection = "higher_better" | "lower_better";
export type ScorecardStatus =
  "on_track" | "off_track" | "no_target" | "not_known";

export interface ScorecardMeasure {
  readonly key: string;
  readonly name: string;
  readonly unit: ScorecardUnit;
  readonly direction: ScorecardDirection;
  /** The dashboardMetrics.ts entry that says how the number is counted. */
  readonly metricId: MetricId;
}

export const SCORECARD_MEASURES: readonly ScorecardMeasure[] = [
  {
    key: "monthly_revenue",
    name: "Monthly Revenue",
    unit: "currency",
    direction: "higher_better",
    metricId: "dashboard.booked_revenue",
  },
  {
    key: "food_cost_percent",
    name: "Food Cost %",
    unit: "percent",
    direction: "lower_better",
    metricId: "dashboard.food_cost_percent",
  },
  {
    key: "profit_margin",
    name: "Profit Margin",
    unit: "percent",
    direction: "higher_better",
    metricId: "dashboard.profit_margin",
  },
  {
    key: "lead_conversion",
    name: "Lead Conversion",
    unit: "percent",
    direction: "higher_better",
    metricId: "dashboard.lead_conversion",
  },
  {
    key: "events_completed",
    name: "Events Completed",
    unit: "count",
    direction: "higher_better",
    metricId: "dashboard.completed_events",
  },
  {
    key: "guests",
    name: "Guests This Month",
    unit: "count",
    direction: "higher_better",
    metricId: "dashboard.guests",
  },
];

export interface ScorecardEvent {
  readonly startsAt?: number | null;
  readonly stage?: string | null;
  readonly quotedPrice?: number | null;
  readonly expectedHeadcount?: number | null;
}

export interface ScorecardCloseout {
  readonly finalizedAt?: number | null;
  readonly capturedAt?: number | null;
  readonly createdAt?: number | null;
  readonly grossProfit?: number | null;
  readonly actualIngredientCost?: number | null;
  readonly budgetedCost?: number | null;
}

export interface ScorecardLead {
  readonly createdAt?: number | null;
  readonly stage?: string | null;
  readonly proposalId?: string | null;
}

export interface ScorecardTargetRow {
  readonly _id: string;
  readonly metricKey: string;
  readonly target: number;
  readonly direction: ScorecardDirection;
  readonly ownerPersonId?: string | null;
  readonly notes?: string | null;
  readonly retiredAt?: number | null;
  readonly deletedAt?: number | null;
  readonly setAt?: number | null;
  readonly version?: number;
}

export interface ScorecardSources {
  readonly events: readonly ScorecardEvent[];
  readonly closeouts: readonly ScorecardCloseout[];
  readonly leads: readonly ScorecardLead[];
  /** Proposals the client accepted; a lead on one became business. */
  readonly acceptedProposalIds?: ReadonlySet<string>;
}

export interface ScorecardMonth {
  readonly year: number;
  /** 0-11, as Date.getMonth(). */
  readonly month: number;
}

export function monthLabel({ year, month }: ScorecardMonth): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function inMonth(
  ts: number | null | undefined,
  { year, month }: ScorecardMonth,
) {
  if (!ts) return false;
  const date = new Date(ts);
  return date.getMonth() === month && date.getFullYear() === year;
}

/** Every scorecard number for one month; null = nothing to count yet. */
export function measureMonth(
  sources: ScorecardSources,
  period: ScorecardMonth,
): Record<string, number | null> {
  const monthEvents = sources.events.filter((e) => inMonth(e.startsAt, period));
  const booked = monthEvents.filter(isBookedEvent);
  const closeouts = sources.closeouts.filter((c) =>
    inMonth(c.finalizedAt ?? c.capturedAt ?? c.createdAt, period),
  );
  const leads = sources.leads.filter((l) => inMonth(l.createdAt, period));
  return {
    monthly_revenue: booked.reduce((sum, e) => sum + (e.quotedPrice ?? 0), 0),
    food_cost_percent: foodCostPercent(closeouts),
    profit_margin: profitMarginPercent(closeouts),
    lead_conversion: percentOf(
      leads.filter((lead) =>
        isConvertedLead(lead, sources.acceptedProposalIds ?? new Set()),
      ).length,
      leads.length,
    ),
    events_completed: monthEvents.filter((e) =>
      COMPLETED_STAGES.includes(e.stage ?? ""),
    ).length,
    guests: booked.reduce((sum, e) => sum + (e.expectedHeadcount ?? 0), 0),
  };
}

/** The given month and the months before it, oldest first. */
export function trailingMonths(now: Date, count: number): ScorecardMonth[] {
  const months: ScorecardMonth[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: date.getFullYear(), month: date.getMonth() });
  }
  return months;
}

/** The live target for each number: newest set, not retired or deleted. */
export function liveTargets(
  targets: readonly ScorecardTargetRow[],
): Map<string, ScorecardTargetRow> {
  const byKey = new Map<string, ScorecardTargetRow>();
  for (const row of targets) {
    if (row.retiredAt != null || row.deletedAt != null) continue;
    const held = byKey.get(row.metricKey);
    if (!held || (row.setAt ?? 0) > (held.setAt ?? 0))
      byKey.set(row.metricKey, row);
  }
  return byKey;
}

export function scorecardStatus(
  actual: number | null,
  target: ScorecardTargetRow | undefined,
): ScorecardStatus {
  if (!target) return "no_target";
  if (actual == null) return "not_known";
  return target.direction === "lower_better"
    ? actual <= target.target
      ? "on_track"
      : "off_track"
    : actual >= target.target
      ? "on_track"
      : "off_track";
}

export interface ScorecardRow {
  readonly measure: ScorecardMeasure;
  readonly actual: number | null;
  readonly previous: number | null;
  /** One value per month, oldest first, ending with this month. */
  readonly trend: ReadonlyArray<{
    readonly month: string;
    readonly value: number | null;
  }>;
  readonly target: ScorecardTargetRow | undefined;
  readonly status: ScorecardStatus;
}

export const TREND_MONTHS = 6;

export function scorecardRows(
  sources: ScorecardSources,
  targets: readonly ScorecardTargetRow[],
  now: Date,
): ScorecardRow[] {
  const months = trailingMonths(now, TREND_MONTHS);
  const values = months.map((period) => measureMonth(sources, period));
  const current = values[values.length - 1];
  const previous = values[values.length - 2];
  const live = liveTargets(targets);
  return SCORECARD_MEASURES.map((measure) => {
    const actual = current[measure.key] ?? null;
    const target = live.get(measure.key);
    return {
      measure,
      actual,
      previous: previous[measure.key] ?? null,
      trend: months.map((period, i) => ({
        month: monthLabel(period),
        value: values[i][measure.key] ?? null,
      })),
      target,
      status: scorecardStatus(actual, target),
    };
  });
}

export function formatScorecardValue(value: number, unit: ScorecardUnit) {
  switch (unit) {
    case "currency":
      return formatMoney(value);
    case "percent":
      return formatPercent(value);
    case "count":
      return formatCount(value);
  }
}

export const SCORECARD_STATUS_LABEL: Record<ScorecardStatus, string> = {
  on_track: "On track",
  off_track: "Off track",
  no_target: "No target set",
  not_known: "Not known yet",
};
