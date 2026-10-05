/**
 * Live-report filters (CF-7.2-01 / CF-7.2-02): one filter state, kept in the
 * saved definition and in the page address so a link opens the same view.
 *
 * Every filter except the date range is an event fact. Rows of other subjects
 * (proposals, demand lines, prep tasks, shifts, deliveries, invoices) follow
 * their eventId; a row with no event cannot match an event filter and is
 * counted as left out, never silently dropped.
 */

export const REPORT_EVENT_FILTER_KEYS = [
  "stage",
  "salespersonId",
  "occasionId",
  "serviceStyleId",
  "venueId",
  "premise",
  "referralSourceId",
] as const;

export type ReportEventFilterKey = (typeof REPORT_EVENT_FILTER_KEYS)[number];

export interface ReportFilters {
  /** First day kept, YYYY-MM-DD on this device's clock. */
  from?: string;
  /** Last day kept, YYYY-MM-DD on this device's clock. */
  to?: string;
  stage?: string;
  salespersonId?: string;
  occasionId?: string;
  serviceStyleId?: string;
  venueId?: string;
  premise?: "on" | "off";
  referralSourceId?: string;
}

export const REPORT_FILTER_LABELS: Record<
  ReportEventFilterKey | "from" | "to",
  string
> = {
  from: "From",
  to: "To",
  stage: "Event stage",
  salespersonId: "Salesperson",
  occasionId: "Occasion",
  serviceStyleId: "Service style",
  venueId: "Venue",
  premise: "On or off premise",
  referralSourceId: "Referral source",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/u;
const URL_PREFIX = "f_";

type Row = Record<string, unknown>;

export interface ReportFilterEvent {
  _id: string;
  stage?: string | null;
  assignedToId?: string | null;
  occasionId?: string | null;
  serviceStyleId?: string | null;
  venueId?: string | null;
  referralSourceId?: string | null;
}

export interface ReportFilterLookups {
  /** Every event the reader can see, by id. */
  events: ReadonlyMap<string, ReportFilterEvent>;
  /** Venue id -> onPremise flag (missing = not known). */
  venueOnPremise: ReadonlyMap<string, boolean | null | undefined>;
}

export interface FilteredRows {
  rows: unknown[];
  /** Rows a filter left out because they have no event to check. */
  noEvent: number;
  /** Rows left out by the filters (the date range included). */
  filteredOut: number;
}

export function hasEventFilter(filters: ReportFilters): boolean {
  return REPORT_EVENT_FILTER_KEYS.some((key) => filters[key] != null);
}

export function activeFilterCount(filters: ReportFilters): number {
  return (["from", "to", ...REPORT_EVENT_FILTER_KEYS] as const).filter(
    (key) => filters[key] != null,
  ).length;
}

/** Keep only well-formed values; anything else is dropped, not guessed. */
export function parseReportFilters(value: unknown): ReportFilters {
  const raw = isRecord(value) ? value : {};
  const filters: ReportFilters = {};
  for (const key of ["from", "to"] as const) {
    const day = raw[key];
    if (typeof day === "string" && DAY.test(day)) filters[key] = day;
  }
  for (const key of REPORT_EVENT_FILTER_KEYS) {
    const item = raw[key];
    if (typeof item !== "string" || !item.trim()) continue;
    if (key === "premise") {
      if (item === "on" || item === "off") filters.premise = item;
      continue;
    }
    filters[key] = item.trim();
  }
  return filters;
}

/** Filter state from the page address (?f_stage=approved&f_from=2026-01-01). */
export function reportFiltersFromSearch(
  params: URLSearchParams,
): ReportFilters {
  const raw: Row = {};
  for (const [key, value] of params) {
    if (key.startsWith(URL_PREFIX)) raw[key.slice(URL_PREFIX.length)] = value;
  }
  return parseReportFilters(raw);
}

/** Writes the filter state into the page address, leaving other keys alone. */
export function writeReportFiltersToSearch(
  params: URLSearchParams,
  filters: ReportFilters,
): URLSearchParams {
  const next = clearReportFiltersFromSearch(params);
  // f_set marks "the address holds the filters", so clearing every filter
  // on screen does not fall back to the saved ones.
  next.set(`${URL_PREFIX}set`, "1");
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value) next.set(URL_PREFIX + key, value);
  }
  return next;
}

/** True when the page address carries a filter state of its own. */
export function searchHasReportFilters(params: URLSearchParams): boolean {
  return [...params.keys()].some((key) => key.startsWith(URL_PREFIX));
}

/** The address without any filter keys (when another report opens). */
export function clearReportFiltersFromSearch(
  params: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  for (const [key, value] of params) {
    if (!key.startsWith(URL_PREFIX)) next.append(key, value);
  }
  return next;
}

/** [start, end) in ms on this device's clock, or null for an open side. */
export function reportFilterRange(filters: ReportFilters): {
  from: number | null;
  to: number | null;
} {
  return {
    from: filters.from ? localDayStart(filters.from) : null,
    to: filters.to ? localDayStart(filters.to, 1) : null,
  };
}

/**
 * Applies the event filters to a subject's rows. The date range is applied by
 * the report builder, which knows each subject's date.
 */
export function applyReportEventFilters(
  subject: string,
  rows: readonly unknown[],
  filters: ReportFilters,
  lookups: ReportFilterLookups,
): FilteredRows {
  if (!hasEventFilter(filters)) {
    return { rows: [...rows], noEvent: 0, filteredOut: 0 };
  }
  const kept: unknown[] = [];
  let noEvent = 0;
  let filteredOut = 0;
  for (const row of rows) {
    if (!isRecord(row)) continue;
    const eventId = subject === "events" ? row._id : row.eventId;
    const event =
      typeof eventId === "string" ? lookups.events.get(eventId) : undefined;
    if (!event) {
      noEvent += 1;
      continue;
    }
    if (eventMatches(event, filters, lookups)) kept.push(row);
    else filteredOut += 1;
  }
  return { rows: kept, noEvent, filteredOut };
}

export function eventMatches(
  event: ReportFilterEvent,
  filters: ReportFilters,
  lookups: Pick<ReportFilterLookups, "venueOnPremise">,
): boolean {
  if (filters.stage && event.stage !== filters.stage) return false;
  if (filters.salespersonId && event.assignedToId !== filters.salespersonId) {
    return false;
  }
  if (filters.occasionId && event.occasionId !== filters.occasionId) {
    return false;
  }
  if (
    filters.serviceStyleId &&
    event.serviceStyleId !== filters.serviceStyleId
  ) {
    return false;
  }
  if (filters.venueId && event.venueId !== filters.venueId) return false;
  if (
    filters.referralSourceId &&
    event.referralSourceId !== filters.referralSourceId
  ) {
    return false;
  }
  if (filters.premise) {
    const onPremise = event.venueId
      ? lookups.venueOnPremise.get(event.venueId)
      : undefined;
    // A venue with no on/off answer matches neither choice.
    if (onPremise == null) return false;
    if ((filters.premise === "on") !== onPremise) return false;
  }
  return true;
}

function localDayStart(day: string, addDays = 0): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year!, month! - 1, date! + addDays).getTime();
}

function isRecord(value: unknown): value is Row {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
