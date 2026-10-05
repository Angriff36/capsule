export type MetricTimeBasis = "device" | "none";
export type MetricCurrency = "company" | "none";
/**
 * live = Capsule's own records as they stand now; live_and_reference = also
 * figures copied in from the old system and kept as history, never re-added
 * as single sales.
 */
export type MetricRecordBasis = "live" | "live_and_reference";

export interface MetricDefinition {
  label: string;
  /** What is added up or counted, in one sentence. */
  measures: string;
  /** The record type the figure reads. */
  source: string;
  /** Which date puts a record in the chosen period. */
  dateBasis: string;
  timeBasis: MetricTimeBasis;
  currency: MetricCurrency;
  /** Which stages or statuses count. */
  includes: string;
  /** Cancelled, voided, refunded, deleted or unknown records. */
  leftOut: string;
  /** Tax, service charge and fee treatment ("Not money." for counts). */
  tax: string;
  recordBasis: MetricRecordBasis;
  /** Where the reader sees the records behind the figure. */
  drill: string;
}

export const NOT_MONEY = "Not money.";
export const QUOTED_TAX =
  "The event's quoted price as entered. Tax, service charge and fees are not split out.";
