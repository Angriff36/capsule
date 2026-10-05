/**
 * One list of how every report figure is counted (PR11-03 / CF-7.1-03).
 *
 * Each live-report KPI and each dashboard figure names an entry here, takes
 * its label from it, and shows the entry to the reader under "How these
 * numbers are counted". A figure with no entry cannot be built, so a new
 * measure has to say what it adds up, which records count, which date picks
 * the period, and where the reader can see the records behind it.
 */
import { DASHBOARD_METRICS } from "./dashboardMetrics";
import { LIVE_REPORT_METRICS } from "./liveReportMetrics";
import type {
  MetricCurrency,
  MetricDefinition,
  MetricRecordBasis,
  MetricTimeBasis,
} from "./metricDefinitionTypes";

export type { MetricDefinition } from "./metricDefinitionTypes";

export const METRIC_DEFINITIONS = {
  ...LIVE_REPORT_METRICS,
  ...DASHBOARD_METRICS,
} as const satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof METRIC_DEFINITIONS;

export const METRIC_TENANT_SCOPE =
  "Only your company's records, and only the ones your role can open.";

export function metricDefinition(id: MetricId): MetricDefinition {
  return METRIC_DEFINITIONS[id];
}

/** The time basis in words, naming the reader's own time zone. */
export function metricTimeBasisLabel(
  basis: MetricTimeBasis,
  zone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  return basis === "device"
    ? `Days and months follow this device's clock (${zone}).`
    : "No period.";
}

export function metricCurrencyLabel(currency: MetricCurrency): string {
  return currency === "company"
    ? "Your company's money (other currencies converted at the invoice's rate)."
    : "Not money.";
}

export function metricRecordBasisLabel(basis: MetricRecordBasis): string {
  return basis === "live"
    ? "Capsule's own records as they stand now."
    : "Capsule's records plus history copied from the old system; the old system's totals are never added again as single sales.";
}
