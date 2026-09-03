import { formatCount, formatMoney, formatPercent } from "../../lib/format";
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

type SourceRow = Record<string, unknown>;

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

/** "Last 12 months" covers this month and the eleven before it. */
const MONTHS_IN_YEAR = 12;

const COUNT_SERIES: ReportTrendSeries = {
  dataKey: "value",
  name: "Records",
  color: "var(--color-brand)",
  valueKind: "count",
};

export function buildLiveReportModel(
  subject: ReportSubjectArea,
  sourceRows: readonly unknown[],
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const rows = sourceRows.filter(isSourceRow);
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const rows = filterRows(sourceRows, dateWindow, (row) =>
    firstDate(row, "startsAt", "createdAt", "_creationTime"),
  );
  const quoted = sum(rows, "quotedPrice");
  return model({
    subject: "events",
    sourceLabel: "Event records",
    sourceDescription:
      "Current event plans supply guest counts, stages, budgets, and quoted revenue.",
    sourcePath: "/events",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Events", formatCount(rows.length)),
      kpi("Expected guests", formatCount(sum(rows, "expectedHeadcount"))),
      kpi("Quoted revenue", formatMoney(quoted)),
      kpi(
        "Average quoted value",
        formatMoney(rows.length ? quoted / rows.length : 0),
      ),
    ],
    breakdown: statusBreakdown(rows, "stage"),
    trend: monthlyTrend(
      rows,
      dateWindow,
      (row) => firstDate(row, "startsAt", "createdAt", "_creationTime"),
      [
        { key: "value", value: () => 1 },
        { key: "quoted", value: (row) => number(row.quotedPrice) },
      ],
    ),
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const dateOf = (row: SourceRow) =>
    firstDate(row, "eventDate", "sentAt", "createdAt", "_creationTime");
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const total = sum(rows, "total");
  const accepted = rows.filter((row) => row.status === "accepted");
  return model({
    subject: "sales",
    sourceLabel: "Proposal records",
    sourceDescription:
      "Current proposals supply pipeline status, guest counts, and proposed value.",
    sourcePath: "/clients/proposals",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Proposals", formatCount(rows.length)),
      kpi("Proposed value", formatMoney(total)),
      kpi("Accepted value", formatMoney(sum(accepted, "total"))),
      kpi(
        "Acceptance rate",
        formatPercent(rows.length ? (accepted.length / rows.length) * 100 : 0),
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const dateOf = (row: SourceRow) =>
    firstDate(
      row,
      "purchasingWeekStart",
      "confirmedAt",
      "calculatedAt",
      "createdAt",
      "_creationTime",
    );
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const confirmed = rows.filter((row) => row.status === "confirmed").length;
  const fulfilled = rows.filter((row) => row.status === "fulfilled").length;
  const unresolved = rows.filter(
    (row) => row.status !== "fulfilled" && row.status !== "superseded",
  ).length;
  return model({
    subject: "inventory",
    sourceLabel: "Ingredient demand records",
    sourceDescription:
      "Demand lines supply quantities and purchasing status. Units stay separate; ingredient and event references remain permission-safe identifiers.",
    sourcePath: "/inventory/demand",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Demand lines", formatCount(rows.length)),
      kpi("Confirmed", formatCount(confirmed)),
      kpi("Fulfilled", formatCount(fulfilled)),
      kpi("Unresolved", formatCount(unresolved)),
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const dateOf = (row: SourceRow) =>
    firstDate(row, "dueAt", "completedAt", "createdAt", "_creationTime");
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const completed = rows.filter((row) => row.status === "completed").length;
  const blocked = rows.filter((row) => row.status === "blocked").length;
  return model({
    subject: "production",
    sourceLabel: "Prep task records",
    sourceDescription:
      "Current prep tasks supply kitchen workload, stations, quantities, and completion status.",
    sourcePath: "/kitchen/prep",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Tasks", formatCount(rows.length)),
      kpi("Completed", formatCount(completed)),
      kpi("Blocked", formatCount(blocked)),
      kpi(
        "Completion rate",
        formatPercent(rows.length ? (completed / rows.length) * 100 : 0),
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const dateOf = (row: SourceRow) =>
    firstDate(row, "startsAt", "createdAt", "_creationTime");
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const hours = rows.reduce((total, row) => total + shiftHours(row), 0);
  const completed = rows.filter((row) => row.status === "completed").length;
  const noShows = rows.filter((row) => row.status === "no_show").length;
  return model({
    subject: "workforce",
    sourceLabel: "Shift records",
    sourceDescription:
      "Current shifts supply scheduled hours, operational roles, and attendance status. Pay rates and labor cost are excluded.",
    sourcePath: "/staff/roster",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Shifts", formatCount(rows.length)),
      kpi(
        "Scheduled hours",
        hours.toLocaleString("en-US", { maximumFractionDigits: 1 }),
      ),
      kpi("Completed", formatCount(completed)),
      kpi("No-shows", formatCount(noShows)),
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const dateOf = (row: SourceRow) =>
    firstDate(
      row,
      "windowStartsAt",
      "scheduledAt",
      "createdAt",
      "_creationTime",
    );
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  return model({
    subject: "logistics",
    sourceLabel: "Delivery records",
    sourceDescription:
      "Current deliveries supply schedule, destination, driver references, and delivery status. Notes and failure details are excluded.",
    sourcePath: "/logistics/deliveries",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Deliveries", formatCount(rows.length)),
      kpi("Delivered", formatCount(countStatus(rows, "delivered"))),
      kpi("In transit", formatCount(countStatus(rows, "in_transit"))),
      kpi("Failed", formatCount(countStatus(rows, "failed"))),
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
  dateWindow: ReportDateWindow,
): LiveReportModel {
  const dateOf = (row: SourceRow) =>
    firstDate(row, "issuedAt", "dueDate", "createdAt", "_creationTime");
  const rows = filterRows(sourceRows, dateWindow, dateOf);
  const invoiced = rows.reduce(
    (total, row) => total + recognizedInvoiceTotal(row),
    0,
  );
  const collected = rows.reduce(
    (total, row) => total + collectedInvoiceTotal(row),
    0,
  );
  const outstanding = rows.reduce(
    (total, row) => total + collectibleInvoiceDue(row),
    0,
  );
  const overdue = rows.filter(isOverdue).length;
  return model({
    subject: "finance",
    sourceLabel: "Invoice records",
    sourceDescription:
      "Current invoices supply issued value, payments received, outstanding balances, and payment status in functional-currency amounts. Collected is the invoice payment total (Invoice.amountPaid), so applied credit memos and written-off balances lower Outstanding without counting as cash and Collected plus Outstanding can be less than Invoiced. Voided invoices stay visible as evidence but contribute $0 to the KPIs.",
    sourcePath: "/finance/invoices",
    effectiveWindow: dateWindow,
    kpis: [
      kpi("Invoiced", formatMoney(invoiced)),
      kpi("Collected", formatMoney(collected)),
      kpi("Outstanding", formatMoney(outstanding)),
      kpi("Overdue invoices", formatCount(overdue)),
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

function model(value: Omit<LiveReportModel, "csvFilename">): LiveReportModel {
  return { ...value, csvFilename: `${value.subject}-report` };
}

function filterRows(
  rows: SourceRow[],
  dateWindow: ReportDateWindow,
  dateOf: (row: SourceRow) => number | null,
): SourceRow[] {
  const threshold = windowStart(dateWindow, Date.now());
  return rows
    .filter((row) => row.deletedAt == null)
    .filter((row) => threshold == null || (dateOf(row) ?? 0) >= threshold)
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
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() - (MONTHS_IN_YEAR - 1),
    1,
  );
}

function monthlyTrend(
  rows: SourceRow[],
  dateWindow: ReportDateWindow,
  dateOf: (row: SourceRow) => number | null,
  metrics: Array<{ key: string; value: (row: SourceRow) => number }>,
): ReportChartPoint[] {
  const buckets = new Map<string, ReportChartPoint>();
  const now = Date.now();
  const threshold = windowStart(dateWindow, now);
  if (threshold != null) {
    const cursor = startOfMonth(threshold);
    const end = startOfMonth(now);
    while (cursor <= end) {
      const key = monthKey(cursor);
      buckets.set(key, emptyBucket(cursor, metrics));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }
  for (const row of rows) {
    const timestamp = dateOf(row);
    if (timestamp == null) continue;
    if (threshold != null && timestamp < threshold) continue;
    const date = startOfMonth(timestamp);
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
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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

function kpi(label: string, value: string): ReportKpi {
  return { label, value };
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

function firstDate(row: SourceRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = date(row[key]);
    if (value != null) return value;
  }
  return null;
}

function date(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
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
