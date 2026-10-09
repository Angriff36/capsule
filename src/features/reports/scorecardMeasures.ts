import { formatCount, formatMoney, formatPercent } from "@/lib/format";
import type { MetricId } from "./metricDefinitions";
import { measureValue, type ScorecardSources } from "./scorecardCounts";
import { trendWindows, type ScorecardPeriod } from "./scorecardPeriods";

export type { ScorecardSources } from "./scorecardCounts";

/**
 * The company scorecard numbers (spec §7.4): the owner's Mangia Company
 * Scorecard (the EOS Traction weekly scorecard, Company_Scorecard.html) -
 * its four areas, its numbers and its written targets - plus four older
 * Capsule numbers kept for the targets already set on them. Each is counted
 * live over its period (scorecardCounts.ts) and compared with its target
 * (ScorecardTarget) to give on track / caution / off track. The Company
 * Scorecard and the L10 page both read these rows, so the two pages agree.
 */

export type ScorecardUnit = "currency" | "percent" | "count";
export type ScorecardDirection = "higher_better" | "lower_better";
export type ScorecardStatus =
  "on_track" | "caution" | "off_track" | "no_target" | "not_known";

export const SCORECARD_AREAS = [
  "Sales",
  "Events / Production",
  "Kitchen / Culinary",
  "Operations / Admin",
  "Other Capsule numbers",
] as const;
export type ScorecardArea = (typeof SCORECARD_AREAS)[number];

export interface ScorecardMeasure {
  readonly key: string;
  readonly name: string;
  readonly area: ScorecardArea;
  readonly period: ScorecardPeriod;
  readonly unit: ScorecardUnit;
  readonly direction: ScorecardDirection;
  /** The dashboardMetrics.ts entry that says how the number is counted. */
  readonly metricId: MetricId;
  /** The target written on the owner's scorecard, as written. */
  readonly scorecardTarget?: string;
}

const SALES = { area: "Sales", direction: "higher_better" } as const;
const EVENTS = { area: "Events / Production" } as const;
const KITCHEN = { area: "Kitchen / Culinary" } as const;
const OPS = { area: "Operations / Admin", period: "now" } as const;
const OTHER = {
  area: "Other Capsule numbers",
  period: "month",
  direction: "higher_better",
} as const;

export const SCORECARD_MEASURES: readonly ScorecardMeasure[] = [
  {
    ...SALES,
    key: "pipeline_value",
    name: "Pipeline Value",
    period: "now",
    unit: "currency",
    metricId: "dashboard.pipeline_value",
    scorecardTarget: "$75,000+",
  },
  {
    ...SALES,
    key: "booked_revenue_week",
    name: "Booked Revenue (Week)",
    period: "week",
    unit: "currency",
    metricId: "dashboard.booked_revenue",
    scorecardTarget: "$15,000+",
  },
  {
    ...SALES,
    key: "close_rate",
    name: "Close Rate",
    period: "week",
    unit: "percent",
    metricId: "dashboard.win_rate",
    scorecardTarget: "35-40% (industry benchmark)",
  },
  {
    ...SALES,
    key: "avg_event_value",
    name: "Avg. Event Value",
    period: "week",
    unit: "currency",
    metricId: "dashboard.booked_average",
    scorecardTarget: "$4,500+",
  },
  {
    ...SALES,
    key: "new_leads_week",
    name: "New Leads / Week",
    period: "week",
    unit: "count",
    metricId: "dashboard.new_leads",
    scorecardTarget: "8-12 (industry benchmark)",
  },
  {
    ...EVENTS,
    key: "events_completed",
    name: "Events Produced / Month",
    period: "month",
    unit: "count",
    direction: "higher_better",
    metricId: "dashboard.completed_events",
    scorecardTarget: "12-18",
  },
  {
    ...EVENTS,
    key: "event_issue_rate",
    name: "Event-Day Issue Rate",
    period: "week",
    unit: "percent",
    direction: "lower_better",
    metricId: "dashboard.event_issue_rate",
    scorecardTarget: "Under 5% (industry benchmark)",
  },
  {
    ...EVENTS,
    key: "staff_utilization",
    name: "Staff Utilization Rate",
    period: "week",
    unit: "percent",
    direction: "higher_better",
    metricId: "dashboard.staff_utilization",
    scorecardTarget: "85%+ (industry benchmark)",
  },
  {
    ...KITCHEN,
    key: "food_cost_percent",
    name: "Food Cost %",
    period: "week",
    unit: "percent",
    direction: "lower_better",
    metricId: "dashboard.food_cost_percent",
    scorecardTarget: "28-32% (industry benchmark)",
  },
  {
    ...KITCHEN,
    key: "prep_on_time",
    name: "Prep Time Accuracy",
    period: "week",
    unit: "percent",
    direction: "higher_better",
    metricId: "dashboard.prep_on_time",
    scorecardTarget: "95%+ on schedule (industry benchmark)",
  },
  {
    ...KITCHEN,
    key: "waste_percent",
    name: "Waste %",
    period: "week",
    unit: "percent",
    direction: "lower_better",
    metricId: "dashboard.waste_percent",
    scorecardTarget: "Under 4% (industry benchmark)",
  },
  {
    ...KITCHEN,
    key: "team_retention",
    name: "Team Retention (Quarterly)",
    period: "quarter",
    unit: "percent",
    direction: "higher_better",
    metricId: "dashboard.team_retention",
    scorecardTarget: "90%+ (industry benchmark)",
  },
  {
    ...OPS,
    key: "equipment_current",
    name: "Equipment Maintenance Score",
    unit: "percent",
    direction: "higher_better",
    metricId: "dashboard.equipment_current",
    scorecardTarget: "100% current (industry benchmark)",
  },
  {
    ...OPS,
    key: "staff_w2_count",
    name: "Staff W2 Count",
    unit: "count",
    direction: "higher_better",
    metricId: "dashboard.staff_w2_count",
    scorecardTarget: "To be set",
  },
  {
    ...OTHER,
    key: "monthly_revenue",
    name: "Monthly Revenue",
    unit: "currency",
    metricId: "dashboard.booked_revenue",
  },
  {
    ...OTHER,
    key: "profit_margin",
    name: "Profit Margin",
    unit: "percent",
    metricId: "dashboard.profit_margin",
  },
  {
    ...OTHER,
    key: "lead_conversion",
    name: "Lead Conversion",
    unit: "percent",
    metricId: "dashboard.lead_conversion",
  },
  {
    ...OTHER,
    key: "guests",
    name: "Guests This Month",
    unit: "count",
    metricId: "dashboard.guests",
  },
];

/**
 * Numbers on the owner's scorecard that Capsule holds no records for yet,
 * and what is missing. Shown as a list, never as a made-up figure.
 */
export const SCORECARD_NOT_COUNTED: ReadonlyArray<{
  readonly name: string;
  readonly area: ScorecardArea;
  readonly missing: string;
}> = [
  {
    name: "Client Satisfaction Score",
    area: "Events / Production",
    missing: "Capsule does not ask clients to rate their event yet.",
  },
  {
    name: "Menu Adoption Rate",
    area: "Kitchen / Culinary",
    missing: "Dishes are not marked as signature items yet.",
  },
  {
    name: "Overhead Cost %",
    area: "Operations / Admin",
    missing: "Overhead costs are not kept in Capsule.",
  },
  {
    name: "Vendor Payment Timeliness",
    area: "Operations / Admin",
    missing: "Supplier bills and their payment dates are not kept in Capsule.",
  },
];

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

/** A miss within this share of the target is caution, not off track. */
export const CAUTION_BAND = 0.1;

export function scorecardStatus(
  actual: number | null,
  target: ScorecardTargetRow | undefined,
): ScorecardStatus {
  if (!target) return "no_target";
  if (actual == null) return "not_known";
  const band = Math.abs(target.target) * CAUTION_BAND;
  if (target.direction === "lower_better") {
    if (actual <= target.target) return "on_track";
    return actual <= target.target + band ? "caution" : "off_track";
  }
  if (actual >= target.target) return "on_track";
  return actual >= target.target - band ? "caution" : "off_track";
}

export interface ScorecardRow {
  readonly measure: ScorecardMeasure;
  readonly actual: number | null;
  /** The period before; null for numbers counted only for today. */
  readonly previous: number | null;
  /** One value per period, oldest first, ending with this one. */
  readonly trend: ReadonlyArray<{
    readonly label: string;
    readonly value: number | null;
  }>;
  readonly target: ScorecardTargetRow | undefined;
  readonly status: ScorecardStatus;
}

export function scorecardRows(
  sources: ScorecardSources,
  targets: readonly ScorecardTargetRow[],
  now: Date,
): ScorecardRow[] {
  const live = liveTargets(targets);
  return SCORECARD_MEASURES.map((measure) => {
    const trend = trendWindows(measure.period, now).map((window) => ({
      label: window.label,
      value: measureValue(measure.key, sources, window, now),
    }));
    const actual = trend[trend.length - 1].value;
    const target = live.get(measure.key);
    return {
      measure,
      actual,
      previous: trend.length > 1 ? trend[trend.length - 2].value : null,
      trend,
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
  caution: "Caution",
  off_track: "Off track",
  no_target: "No target set",
  not_known: "Not known yet",
};
