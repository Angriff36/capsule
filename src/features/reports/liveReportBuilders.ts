import { formatCount, formatMoney, formatPercent } from "../../lib/format";
import { InvoiceMoneyLedger } from "../../lib/invoiceMoneyLedger";
import { formatStatusLabel } from "../../lib/statusLabels";
import type { ReportSubjectArea } from "./ReportCreateForm";
import type {
  LiveReportModel,
  ReportCellValue,
  ReportChartPoint,
  ReportColumn,
  ReportDateWindow,
  ReportKpi,
  ReportRow,
  ReportTrendSeries,
} from "./liveReportModel";
import { metricDefinition, type MetricId } from "./metricDefinitions";
import { date, REPORT_DATE_OF } from "./liveReportDates";
import { countLeftOut, NO_LEFT_OUT } from "./liveReportLeftOut";
import { NOT_KNOWN } from "./dashboardRecordSets";

type SourceRow = Record<string, unknown>;

// Months follow the reader's own clock, like every dashboard and date on
// screen (metricDefinitions timeBasis "device"). UTC months put an evening
// event on the 31st into the next month.
const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
});

/** "Last 12 months" covers this month and the eleven before it. */
const MONTHS_IN_YEAR = 12;

const COUNT_SERIES: ReportTrendSeries = {
  dataKey: "value",
  name: "Total",
  color: "var(--color-brand)",
  valueKind: "count",
};

export function buildLiveReportModel(
  subject: ReportSubjectArea,
  sourceRows: readonly unknown[],
  window: ReportDateWindow,
  /** From / To days (ms, [from, to)); either side replaces the date window. */
  range: { from: number | null; to: number | null } = { from: null, to: null },
): LiveReportModel {
  const rows = sourceRows.filter(isSourceRow);
  const dateWindow: ReportPeriod = { window, ...range };
  const { from, to } = periodBounds(dateWindow, Date.now());
  return {
    ...buildSubjectReport(subject, rows, dateWindow),
    leftOut: countLeftOut(subject, rows, from, to),
  };
}

function buildSubjectReport(
  subject: ReportSubjectArea,
  rows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  switch (subject) {
    case "events":
      return buildEventsReport(rows, dateWindow);
    case "sales":
      return buildSalesReport(rows, dateWindow);
    case "inventory":
      return buildInventoryReport(rows, dateWindow);
    case "production":
      return buildProductionReport(rows, dateWindow);
    case "workforce":
      return buildWorkforceReport(rows, dateWindow);
    case "logistics":
      return buildLogisticsReport(rows, dateWindow);
    case "finance":
      return buildFinanceReport(rows, dateWindow);
  }
}

function buildEventsReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const rows = filterRows(sourceRows, dateWindow, REPORT_DATE_OF.events);
  const quoted = sum(rows, "quotedPrice");
  return model({
    subject: "events",
    sourceLabel: "Events",
    sourceDescription:
      "Current event plans supply guest counts, stages, budgets, and quoted revenue.",
    sourcePath: "/events",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("events.count", formatCount(rows.length)),
      kpi(
        "events.expected_guests",
        formatCount(sum(rows, "expectedHeadcount")),
      ),
      kpi("events.quoted_revenue", formatMoney(quoted)),
      kpi(
        "events.average_quoted",
        formatMoney(rows.length ? quoted / rows.length : 0),
      ),
    ],
    breakdown: statusBreakdown(rows, "stage"),
    trend: monthlyTrend(rows, dateWindow, REPORT_DATE_OF.events, [
      { key: "value", value: () => 1 },
      { key: "quoted", value: (row) => number(row.quotedPrice) },
    ]),
    trendSeries: [
      { ...COUNT_SERIES, name: "Events" },
      {
        dataKey: "quoted",
        name: "Quoted revenue",
        color: "var(--color-accent)",
        valueKind: "money",
      },
    ],
    columns: columns([
      ["title", "Event", "text"],
      ["startsAt", "Start", "date"],
      ["venueName", "Venue", "text"],
      ["stage", "Stage", "text"],
      ["expectedHeadcount", "Expected guests", "number"],
      ["budgetAmount", "Budget", "money"],
      ["quotedPrice", "Quoted price", "money"],
    ]),
    rows: detailRows(rows, [
      "title",
      "startsAt",
      "venueName",
      "stage",
      "expectedHeadcount",
      "budgetAmount",
      "quotedPrice",
    ]),
  });
}

function buildSalesReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const dateOf = REPORT_DATE_OF.sales;
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const total = sum(rows, "total");
  const accepted = rows.filter((row) => row.status === "accepted");
  return model({
    subject: "sales",
    sourceLabel: "Proposals",
    sourceDescription:
      "Current proposals supply pipeline status, guest counts, and proposed value.",
    sourcePath: "/clients/proposals",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("sales.proposals", formatCount(rows.length)),
      kpi("sales.proposed_value", formatMoney(total)),
      kpi(
        "sales.accepted_value",
        formatMoney(sum(accepted, "total")),
        accepted,
      ),
      kpi(
        "sales.acceptance_rate",
        rows.length
          ? formatPercent((accepted.length / rows.length) * 100)
          : NOT_KNOWN,
      ),
    ],
    breakdown: statusBreakdown(rows, "status"),
    trend: monthlyTrend(rows, dateWindow, dateOf, [
      { key: "value", value: () => 1 },
      { key: "amount", value: (row) => number(row.total) },
    ]),
    trendSeries: [
      { ...COUNT_SERIES, name: "Proposals" },
      {
        dataKey: "amount",
        name: "Proposed value",
        color: "var(--color-accent)",
        valueKind: "money",
      },
    ],
    columns: columns([
      ["proposalNumber", "Proposal", "text"],
      ["title", "Title", "text"],
      ["eventDate", "Event date", "date"],
      ["status", "Status", "text"],
      ["guestCount", "Guests", "number"],
      ["total", "Total", "money"],
    ]),
    rows: detailRows(rows, [
      "proposalNumber",
      "title",
      "eventDate",
      "status",
      "guestCount",
      "total",
    ]),
  });
}

function buildInventoryReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const dateOf = REPORT_DATE_OF.inventory;
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const confirmed = withStatus(rows, "confirmed");
  const fulfilled = withStatus(rows, "fulfilled");
  const unresolved = rows.filter(
    (row) => row.status !== "fulfilled" && row.status !== "superseded",
  );
  return model({
    subject: "inventory",
    sourceLabel: "Ingredient demand",
    sourceDescription:
      "Demand lines supply quantities and purchasing status. Units stay separate, and the ingredient and event they belong to only show what you're allowed to see.",
    sourcePath: "/inventory/demand",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("inventory.demand_lines", formatCount(rows.length)),
      kpi("inventory.confirmed", formatCount(confirmed.length), confirmed),
      kpi("inventory.fulfilled", formatCount(fulfilled.length), fulfilled),
      kpi("inventory.unresolved", formatCount(unresolved.length), unresolved),
    ],
    breakdown: statusBreakdown(rows, "status"),
    trend: monthlyTrend(rows, dateWindow, dateOf, [
      { key: "value", value: () => 1 },
    ]),
    trendSeries: [{ ...COUNT_SERIES, name: "Demand lines" }],
    columns: columns([
      ["ingredientId", "Ingredient ref", "text"],
      ["eventId", "Event ref", "text"],
      ["requiredQuantity", "Required", "number"],
      ["unit", "Unit", "text"],
      ["status", "Status", "text"],
      ["purchasingWeekStart", "Purchasing week", "date"],
    ]),
    rows: detailRows(
      rows,
      [
        "ingredientId",
        "eventId",
        "requiredQuantity",
        "unit",
        "status",
        "purchasingWeekStart",
      ],
      new Set(["ingredientId", "eventId"]),
    ),
  });
}

function buildProductionReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const dateOf = REPORT_DATE_OF.production;
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const completedRows = withStatus(rows, "completed");
  const blockedRows = withStatus(rows, "blocked");
  const completed = completedRows.length;
  const blocked = blockedRows.length;
  return model({
    subject: "production",
    sourceLabel: "Prep tasks",
    sourceDescription:
      "Current prep tasks supply kitchen workload, stations, quantities, and completion status.",
    sourcePath: "/kitchen/prep",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("production.tasks", formatCount(rows.length)),
      kpi("production.completed", formatCount(completed), completedRows),
      kpi("production.blocked", formatCount(blocked), blockedRows),
      kpi(
        "production.completion_rate",
        rows.length
          ? formatPercent((completed / rows.length) * 100)
          : NOT_KNOWN,
      ),
    ],
    breakdown: statusBreakdown(rows, "status"),
    trend: monthlyTrend(rows, dateWindow, dateOf, [
      { key: "value", value: () => 1 },
      {
        key: "completed",
        value: (row) => (row.status === "completed" ? 1 : 0),
      },
    ]),
    trendSeries: [
      { ...COUNT_SERIES, name: "Tasks" },
      {
        dataKey: "completed",
        name: "Completed",
        color: "var(--color-ok)",
        valueKind: "count",
      },
    ],
    columns: columns([
      ["name", "Task", "text"],
      ["dueAt", "Due", "date"],
      ["station", "Station", "text"],
      ["category", "Category", "text"],
      ["quantity", "Quantity", "number"],
      ["unit", "Unit", "text"],
      ["status", "Status", "text"],
    ]),
    rows: detailRows(rows, [
      "name",
      "dueAt",
      "station",
      "category",
      "quantity",
      "unit",
      "status",
    ]),
  });
}

function buildWorkforceReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const dateOf = REPORT_DATE_OF.workforce;
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const hours = rows.reduce((total, row) => total + shiftHours(row), 0);
  const completedRows = withStatus(rows, "completed");
  const noShowRows = withStatus(rows, "no_show");
  // A shift with no usable start and end has unknown hours, not zero.
  const timed = rows.filter((row) => shiftHours(row) > 0);
  const untimed = rows.filter((row) => shiftHours(row) <= 0);
  return model({
    subject: "workforce",
    sourceLabel: "Shifts",
    sourceDescription:
      "Current shifts supply scheduled hours, operational roles, and attendance status. Pay rates and labor cost are excluded.",
    sourcePath: "/staff/roster",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("workforce.shifts", formatCount(rows.length)),
      kpi(
        "workforce.scheduled_hours",
        hoursWithCoverage(hours, untimed.length),
        timed,
      ),
      kpi(
        "workforce.completed",
        formatCount(completedRows.length),
        completedRows,
      ),
      kpi("workforce.no_shows", formatCount(noShowRows.length), noShowRows),
    ],
    breakdown: statusBreakdown(rows, "status"),
    trend: monthlyTrend(rows, dateWindow, dateOf, [
      { key: "value", value: () => 1 },
      { key: "hours", value: shiftHours },
    ]),
    trendSeries: [
      { ...COUNT_SERIES, name: "Shifts" },
      {
        dataKey: "hours",
        name: "Scheduled hours",
        color: "var(--color-accent)",
        valueKind: "hours",
      },
    ],
    columns: columns([
      ["startsAt", "Start", "date"],
      ["endsAt", "End", "date"],
      ["role", "Role", "text"],
      ["status", "Status", "text"],
      ["scheduledHours", "Scheduled hours", "number"],
      ["personId", "Person ref", "text"],
    ]),
    rows: rows.map((row) => ({
      id: rowId(row),
      values: {
        startsAt: cell(row.startsAt),
        endsAt: cell(row.endsAt),
        role: cell(row.role),
        status: cell(row.status),
        scheduledHours: shiftHours(row),
        personId: compactId(row.personId),
      },
    })),
  });
}

function buildLogisticsReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const dateOf = REPORT_DATE_OF.logistics;
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  return model({
    subject: "logistics",
    sourceLabel: "Deliveries",
    sourceDescription:
      "Current deliveries supply schedule, destination, who's driving, and delivery status. Notes and failure details are excluded.",
    sourcePath: "/logistics/deliveries",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("logistics.deliveries", formatCount(rows.length)),
      statusKpi("logistics.delivered", rows, "delivered"),
      statusKpi("logistics.in_transit", rows, "in_transit"),
      statusKpi("logistics.failed", rows, "failed"),
    ],
    breakdown: statusBreakdown(rows, "status"),
    trend: monthlyTrend(rows, dateWindow, dateOf, [
      { key: "value", value: () => 1 },
      {
        key: "delivered",
        value: (row) => (row.status === "delivered" ? 1 : 0),
      },
    ]),
    trendSeries: [
      { ...COUNT_SERIES, name: "Deliveries" },
      {
        dataKey: "delivered",
        name: "Delivered",
        color: "var(--color-ok)",
        valueKind: "count",
      },
    ],
    columns: columns([
      ["windowStartsAt", "Window start", "date"],
      ["destination", "Destination", "text"],
      ["status", "Status", "text"],
      ["driverId", "Driver ref", "text"],
      ["eventId", "Event ref", "text"],
    ]),
    rows: detailRows(
      rows,
      ["windowStartsAt", "destination", "status", "driverId", "eventId"],
      new Set(["driverId", "eventId"]),
    ),
  });
}

function buildFinanceReport(
  sourceRows: SourceRow[],
  dateWindow: ReportPeriod,
): LiveReportModel {
  const dateOf = REPORT_DATE_OF.finance;
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const ledger = new InvoiceMoneyLedger();
  const invoiced = ledger.sum(rows.map(recognizedInvoiceTotal));
  const collected = ledger.sum(rows.map(collectedInvoiceTotal));
  const outstanding = ledger.sum(rows.map(collectibleInvoiceDue));
  const overdueRows = rows.filter(isOverdue);
  const counted = rows.filter((row) => row.status !== "voided");
  return model({
    subject: "finance",
    sourceLabel: "Invoices",
    sourceDescription:
      "Current invoices supply issued value, payments received, outstanding balances, and payment status in functional-currency amounts. Collected is the total paid so far on the invoice, so applied credit memos and written-off balances lower Outstanding without counting as cash, and Collected plus Outstanding can be less than Invoiced. Voided invoices stay visible as evidence but contribute $0 to the KPIs.",
    sourcePath: "/finance/invoices",
    effectiveWindow: dateWindow.window,
    kpis: [
      kpi("finance.invoiced", formatMoney(invoiced), counted),
      kpi("finance.collected", formatMoney(collected), counted),
      kpi("finance.outstanding", formatMoney(outstanding), counted),
      kpi("finance.overdue", formatCount(overdueRows.length), overdueRows),
    ],
    breakdown: statusBreakdown(rows, "status"),
    trend: monthlyTrend(rows, dateWindow, dateOf, [
      { key: "value", value: recognizedInvoiceTotal },
      { key: "collected", value: collectedInvoiceTotal },
    ]),
    trendSeries: [
      {
        dataKey: "value",
        name: "Invoiced",
        color: "var(--color-brand)",
        valueKind: "money",
      },
      {
        dataKey: "collected",
        name: "Collected",
        color: "var(--color-ok)",
        valueKind: "money",
      },
    ],
    columns: columns([
      ["invoiceNumber", "Invoice", "text"],
      ["issuedAt", "Issued", "date"],
      ["dueDate", "Due", "date"],
      ["status", "Status", "text"],
      ["functionalTotal", "Total", "money"],
      ["functionalPaid", "Paid", "money"],
      ["functionalDue", "Outstanding", "money"],
    ]),
    rows: rows.map((row) => ({
      id: rowId(row),
      values: {
        invoiceNumber: cell(row.invoiceNumber),
        issuedAt: cell(row.issuedAt),
        dueDate: cell(row.dueDate),
        status: cell(row.status),
        functionalTotal: invoiceTotal(row),
        functionalPaid: collectedInvoiceTotal(row),
        functionalDue: collectibleInvoiceDue(row),
      },
    })),
  });
}

function model(
  value: Omit<LiveReportModel, "csvFilename" | "leftOut">,
): LiveReportModel {
  return {
    ...value,
    csvFilename: `${value.subject}-report`,
    leftOut: NO_LEFT_OUT,
  };
}

/** The saved date window, or From / To days that replace it. */
interface ReportPeriod {
  window: ReportDateWindow;
  from: number | null;
  to: number | null;
}

/**
 * The [from, to) a report counts (null = open), for loading only that
 * period's rows; the same bounds the builders filter by.
 */
export function liveReportBounds(
  window: ReportDateWindow,
  range: { from: number | null; to: number | null },
  now: number,
): { from: number | null; to: number | null } {
  const { from, to } = periodBounds({ window, ...range }, now);
  return { from, to };
}

/** [from, to) plus the last instant the trend draws a month for. */
function periodBounds(period: ReportPeriod, now: number) {
  if (period.from != null || period.to != null) {
    return {
      from: period.from,
      to: period.to,
      lastDrawn: period.to != null ? period.to - 1 : now,
    };
  }
  return { from: windowStart(period.window, now), to: null, lastDrawn: now };
}

function filterRows(
  rows: SourceRow[],
  dateWindow: ReportPeriod,
  dateOf: (row: SourceRow) => number | null,
): SourceRow[] {
  const { from, to } = periodBounds(dateWindow, Date.now());
  return rows
    .filter((row) => row.deletedAt == null)
    .filter((row) => from == null || (dateOf(row) ?? 0) >= from)
    .filter((row) => to == null || (dateOf(row) ?? 0) < to)
    .sort((left, right) => (dateOf(right) ?? 0) - (dateOf(left) ?? 0));
}

function windowStart(dateWindow: ReportDateWindow, now: number): number | null {
  if (dateWindow === "all_time") return null;
  if (dateWindow === "30_days") return now - 30 * 86_400_000;
  if (dateWindow === "90_days") return now - 90 * 86_400_000;
  // Twelve months = the current month plus the eleven before it. Anchoring at
  // (year - 1, same month) spanned thirteen month starts, so the trend drew 13
  // buckets and kept records from the same month one year ago.
  const date = new Date(now);
  return new Date(
    date.getFullYear(),
    date.getMonth() - (MONTHS_IN_YEAR - 1),
    1,
  ).getTime();
}

function monthlyTrend(
  rows: SourceRow[],
  dateWindow: ReportPeriod,
  dateOf: (row: SourceRow) => number | null,
  metrics: Array<{ key: string; value: (row: SourceRow) => number }>,
): ReportChartPoint[] {
  const buckets = new Map<string, ReportChartPoint>();
  const bounds = periodBounds(dateWindow, Date.now());
  const threshold = bounds.from;
  // "now" below = the last instant the chart draws: today for a date window,
  // the day before To for a From / To range.
  const now = bounds.lastDrawn;
  // A bounded window (30 days, 90 days, 12 months) pre-seeds exactly the
  // month buckets from windowStart's month through the current month —
  // earliestBucket/latestBucket below, computed once from that same
  // threshold/now pair. filterRows only enforces the lower bound
  // (dateOf(row) >= threshold): it has no upper bound, so a row dated after
  // "now" (a scheduled event, a not-yet-issued invoice line, a future
  // shift or delivery window — all ordinary for a forward-scheduling app)
  // still reaches this function. Without a matching check here, such a row
  // falls through to `buckets.get(key) ?? emptyBucket(...)` and fabricates
  // a bucket beyond latestBucket, so a "last 12 months" trend can render
  // 13+ points. Comparing at month granularity (not the raw timestamp,
  // which would need a second now-dependent threshold recompute prone to a
  // straddled-instant race) keeps both edges — old and future-dated rows —
  // aligned with the exact range the seeding loop promised the chart.
  // Timestamps, not Date references: `cursor` below is mutated in place
  // by the seeding loop, so capturing its .getTime() up front (rather than
  // the Date object itself) keeps earliestBucket fixed at the window's
  // first month instead of drifting to the loop's final value.
  let earliestBucket: number | null = null;
  let latestBucket: number | null = null;
  if (threshold != null) {
    const cursor = startOfMonth(threshold);
    const end = startOfMonth(now);
    earliestBucket = cursor.getTime();
    latestBucket = end.getTime();
    while (cursor <= end) {
      const key = monthKey(cursor);
      buckets.set(key, emptyBucket(cursor, metrics));
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }
  for (const row of rows) {
    const timestamp = dateOf(row);
    if (timestamp == null) continue;
    const date = startOfMonth(timestamp);
    if (earliestBucket != null && date.getTime() < earliestBucket) continue;
    if (latestBucket != null && date.getTime() > latestBucket) continue;
    const key = monthKey(date);
    const bucket = buckets.get(key) ?? emptyBucket(date, metrics);
    for (const metric of metrics) {
      bucket[metric.key] = number(bucket[metric.key]) + metric.value(row);
    }
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, bucket]) => bucket);
}

function emptyBucket(
  date: Date,
  metrics: Array<{ key: string }>,
): ReportChartPoint {
  const bucket: ReportChartPoint = {
    label: MONTH_FORMAT.format(date),
    value: 0,
  };
  for (const metric of metrics) bucket[metric.key] = 0;
  return bucket;
}

function startOfMonth(timestamp: number): Date {
  const value = new Date(timestamp);
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function statusBreakdown(rows: SourceRow[], key: string): ReportChartPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const status = typeof row[key] === "string" ? row[key] : "unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, value]) => ({ label: formatStatusLabel(status), value }))
    .sort((left, right) => right.value - left.value);
}

function detailRows(
  rows: SourceRow[],
  keys: string[],
  compactKeys = new Set<string>(),
): ReportRow[] {
  return rows.map((row) => ({
    id: rowId(row),
    values: Object.fromEntries(
      keys.map((key) => [
        key,
        compactKeys.has(key) ? compactId(row[key]) : cell(row[key]),
      ]),
    ),
  }));
}

function columns(
  values: Array<[string, string, ReportColumn["kind"]]>,
): ReportColumn[] {
  return values.map(([key, label, kind]) => ({ key, label, kind }));
}

/** `behind` = the rows the figure is made from; omit when it is every row. */
function kpi(
  metricId: MetricId,
  value: string,
  behind?: readonly SourceRow[],
): ReportKpi {
  return {
    metricId,
    label: metricDefinition(metricId).label,
    value,
    rowIds: behind ? behind.map(rowId) : null,
  };
}

function withStatus(rows: SourceRow[], status: string): SourceRow[] {
  return rows.filter((row) => row.status === status);
}

function hoursWithCoverage(hours: number, untimed: number): string {
  const total = hours.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (untimed === 0) return total;
  return `${total} · ${formatCount(untimed)} ${untimed === 1 ? "shift" : "shifts"} not timed`;
}

function statusKpi(
  metricId: MetricId,
  rows: SourceRow[],
  status: string,
): ReportKpi {
  const behind = withStatus(rows, status);
  return kpi(metricId, formatCount(behind.length), behind);
}

function countStatus(rows: SourceRow[], status: string): number {
  return rows.filter((row) => row.status === status).length;
}

function sum(rows: SourceRow[], key: string): number {
  return rows.reduce((total, row) => total + number(row[key]), 0);
}

function shiftHours(row: SourceRow): number {
  const start = date(row.startsAt);
  const end = date(row.endsAt);
  return start != null && end != null && end > start
    ? (end - start) / 3_600_000
    : 0;
}

function invoiceTotal(row: SourceRow): number {
  return number(row.functionalCurrencyTotal ?? row.total);
}

function invoiceDue(row: SourceRow): number {
  return number(row.functionalCurrencyAmountDue ?? row.amountDue);
}

/**
 * Invoice.safeExchangeRate (computed by the Invoice query hydration) folds an
 * invoice-currency amount into the tenant's functional currency. Null / <= 0
 * rates mean "already functional currency", matching the computed field.
 */
function invoiceExchangeRate(row: SourceRow): number {
  const rate = number(row.safeExchangeRate ?? row.exchangeRate);
  return rate > 0 ? rate : 1;
}

/**
 * Cash actually received, in functional currency. Invoice.amountPaid is the
 * command-maintained payment total: Invoice.applyPayment (run by the
 * PaymentSettled reaction) and markDepositPaid raise it, recordRefund lowers
 * it. applyCredit and writeOff lower amountDue and never touch amountPaid, so
 * `total - amountDue` reports account credit and written-off balance as money
 * received. Round like the functionalCurrency* computed fields so Invoiced,
 * Collected, and Outstanding stay on one scale.
 */
function invoicePaid(row: SourceRow): number {
  return Math.round(number(row.amountPaid) * invoiceExchangeRate(row));
}

function recognizedInvoiceTotal(row: SourceRow): number {
  return row.status === "voided" ? 0 : invoiceTotal(row);
}

function collectedInvoiceTotal(row: SourceRow): number {
  if (row.status === "voided") return 0;
  return Math.max(0, invoicePaid(row));
}

function collectibleInvoiceDue(row: SourceRow): number {
  return row.status === "voided" ? 0 : invoiceDue(row);
}

function isOverdue(row: SourceRow): boolean {
  if (row.status === "overdue") return true;
  const dueDate = date(row.dueDate);
  return (
    dueDate != null &&
    dueDate < Date.now() &&
    invoiceDue(row) > 0 &&
    row.status !== "voided" &&
    row.status !== "written_off"
  );
}

function number(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rowId(row: SourceRow): string {
  return String(row._id ?? row.id ?? `${row._creationTime ?? "row"}`);
}

function compactId(value: unknown): string {
  const raw = String(value ?? "");
  if (!raw) return "—";
  return raw.length > 14 ? `${raw.slice(0, 7)}…${raw.slice(-5)}` : raw;
}

function cell(value: unknown): ReportCellValue {
  if (typeof value === "string" || typeof value === "number") return value;
  return value == null ? null : String(value);
}

function isSourceRow(value: unknown): value is SourceRow {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
