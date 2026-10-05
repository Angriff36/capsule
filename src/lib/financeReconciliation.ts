/**
 * PR05-10 / AC-093: ties the old system's money rows to Capsule's payments.
 *
 * Every imported money row and every Capsule payment in the window becomes one
 * line with one result, grouped by month, currency and result:
 * - matched: both sides agree to the cent.
 * - differs: matched, but the amounts disagree or the Capsule payment has not
 *   come in yet.
 * - source_only: money in the old system that no Capsule payment carries.
 * - ledger_only: a Capsule payment no old-system row points at.
 * - excluded: the same money seen twice, or a record-only row (quote,
 *   report total, balance). Kept and shown, never counted.
 * The month is the date the money actually moved (old system date first);
 * the import date is kept beside it and never used for the month.
 */
import { centsToDollars, dollarsToCents } from "./ledgerMoney";

export type ReconciliationResult =
  "matched" | "differs" | "source_only" | "ledger_only" | "excluded";

export const RECONCILIATION_RESULT_LABEL: Record<ReconciliationResult, string> =
  {
    matched: "Agrees",
    differs: "Does not agree",
    source_only: "Only in the old system",
    ledger_only: "Only in Capsule",
    excluded: "Left out (same money twice or record only)",
  };

export interface ReconciliationSourceRow {
  _id: string;
  _creationTime?: number;
  createdAt?: number | null;
  recordType: string;
  externalId: string;
  capsuleId: string;
  conflictStatus: string;
  rawSourceData?: string | null;
  resolutionNote?: string | null;
  deletedAt?: number | null;
}

export interface ReconciliationPayment {
  _id: string;
  amount?: number | null;
  status?: string | null;
  invoiceId?: string | null;
  deletedAt?: number | null;
  effectiveAt?: number | null;
  occurredAt?: number | null;
  settledAt?: number | null;
  recordedAt?: number | null;
}

export interface ReconciliationInvoice {
  _id: string;
  currencyCode?: string | null;
}

export interface ReconciliationLine {
  key: string;
  period: string;
  currency: string;
  result: ReconciliationResult;
  sourceRowId: string | null;
  externalId: string | null;
  paymentId: string | null;
  sourceAmount: number | null;
  ledgerAmount: number | null;
  difference: number;
  /** When the money moved (old system date, else the Capsule payment date). */
  actualAt: number | null;
  /** When the old row was brought into Capsule. */
  importedAt: number | null;
  reason: string;
}

export interface ReconciliationGroup {
  period: string;
  currency: string;
  result: ReconciliationResult;
  count: number;
  sourceTotal: number;
  ledgerTotal: number;
  difference: number;
}

export interface ReconciliationPeriodTotal {
  period: string;
  currency: string;
  sourceTotal: number;
  ledgerTotal: number;
  difference: number;
  excludedCount: number;
  excludedTotal: number;
}

export interface FinanceReconciliationReport {
  kind: "finance-reconciliation";
  generatedAt: number;
  from: number | null;
  to: number | null;
  periods: ReconciliationPeriodTotal[];
  groups: ReconciliationGroup[];
  /** Every line that is not "matched", with the ids to look it up. */
  discrepancies: ReconciliationLine[];
  matchedCount: number;
}

const RECEIVED = new Set(["completed", "refunded", "charged_back", "returned"]);
const NO_DATE = "No date";

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function raw(row: ReconciliationSourceRow): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(row.rawSourceData ?? "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function currencyOf(value: string | null): string {
  return (value ?? "USD").toUpperCase();
}

export function reconciliationPeriod(at: number | null): string {
  if (at === null) return NO_DATE;
  const date = new Date(at);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function paymentDate(payment: ReconciliationPayment): number | null {
  return (
    num(payment.occurredAt) ??
    num(payment.effectiveAt) ??
    num(payment.settledAt) ??
    num(payment.recordedAt)
  );
}

function inWindow(
  at: number | null,
  from: number | null,
  to: number | null,
): boolean {
  if (from === null && to === null) return true;
  if (at === null) return false;
  return (from === null || at >= from) && (to === null || at <= to);
}

/** Earliest and latest old-system money dates, for the default window. */
export function sourceMoneySpan(
  rows: readonly ReconciliationSourceRow[],
): { from: number; to: number } | null {
  const dates = rows
    .filter((row) => row.recordType === "payment" && row.deletedAt == null)
    .map((row) => num(raw(row).recordedAt))
    .filter((at): at is number => at !== null);
  if (dates.length === 0) return null;
  return { from: Math.min(...dates), to: Math.max(...dates) };
}

export function buildFinanceReconciliation({
  sourceRows,
  payments,
  invoices,
  from = null,
  to = null,
  generatedAt,
}: {
  sourceRows: readonly ReconciliationSourceRow[];
  payments: readonly ReconciliationPayment[];
  invoices: readonly ReconciliationInvoice[];
  from?: number | null;
  to?: number | null;
  generatedAt: number;
}): FinanceReconciliationReport {
  const invoiceCurrency = new Map(
    invoices.map((invoice) => [
      String(invoice._id),
      currencyOf(text(invoice.currencyCode)),
    ]),
  );
  const livePayments = new Map(
    payments
      .filter((payment) => payment.deletedAt == null)
      .map((payment) => [String(payment._id), payment]),
  );
  const paymentCurrency = (payment: ReconciliationPayment) =>
    invoiceCurrency.get(String(payment.invoiceId)) ?? "USD";
  const lines: ReconciliationLine[] = [];
  const pointedAt = new Set<string>();

  for (const row of sourceRows) {
    if (
      row.recordType !== "payment" ||
      row.deletedAt != null ||
      row.conflictStatus === "superseded"
    )
      continue;
    const facts = raw(row);
    const actualAt = num(facts.recordedAt);
    const sourceAmount = num(facts.amount) ?? 0;
    const currency = currencyOf(
      text(facts.currency) ?? text(facts.currencyCode),
    );
    const importedAt = num(row.createdAt) ?? num(row._creationTime);
    const payment = row.capsuleId ? livePayments.get(row.capsuleId) : null;
    if (row.capsuleId) pointedAt.add(row.capsuleId);
    if (!inWindow(actualAt, from, to)) continue;
    const base = {
      key: `source:${row._id}`,
      period: reconciliationPeriod(actualAt),
      currency,
      sourceRowId: String(row._id),
      externalId: row.externalId,
      actualAt,
      importedAt,
    };

    if (!row.capsuleId && facts.movesMoney !== true) {
      lines.push({
        ...base,
        result: "excluded",
        paymentId: null,
        sourceAmount,
        ledgerAmount: null,
        difference: 0,
        reason: `Record only (${text(facts.rowClass) ?? "not money of its own"}), not counted.`,
      });
      continue;
    }
    if (!row.capsuleId && row.conflictStatus === "resolved") {
      lines.push({
        ...base,
        result: "excluded",
        paymentId: null,
        sourceAmount,
        ledgerAmount: null,
        difference: 0,
        reason:
          text(row.resolutionNote) ??
          "The same money is already counted on another row.",
      });
      continue;
    }
    if (!payment) {
      lines.push({
        ...base,
        result: "source_only",
        paymentId: row.capsuleId || null,
        sourceAmount,
        ledgerAmount: null,
        difference: sourceAmount,
        reason: row.capsuleId
          ? "Matched to a Capsule payment that was deleted."
          : "No Capsule payment carries this money yet.",
      });
      continue;
    }
    const received = RECEIVED.has(String(payment.status));
    const ledgerAmount = received ? (num(payment.amount) ?? 0) : 0;
    const differenceCents =
      dollarsToCents(Math.abs(sourceAmount)) - dollarsToCents(ledgerAmount);
    const agrees = received && differenceCents === 0;
    lines.push({
      ...base,
      result: agrees ? "matched" : "differs",
      paymentId: String(payment._id),
      sourceAmount: Math.abs(sourceAmount),
      ledgerAmount,
      difference: centsToDollars(differenceCents),
      reason: agrees
        ? "Both sides agree."
        : !received
          ? `The Capsule payment is ${String(payment.status ?? "not recorded")}, so no money has come in yet.`
          : "The amounts do not agree.",
    });
  }

  for (const payment of livePayments.values()) {
    const id = String(payment._id);
    if (pointedAt.has(id) || !RECEIVED.has(String(payment.status))) continue;
    const actualAt = paymentDate(payment);
    if (!inWindow(actualAt, from, to)) continue;
    const ledgerAmount = num(payment.amount) ?? 0;
    lines.push({
      key: `payment:${id}`,
      period: reconciliationPeriod(actualAt),
      currency: paymentCurrency(payment),
      result: "ledger_only",
      sourceRowId: null,
      externalId: null,
      paymentId: id,
      sourceAmount: null,
      ledgerAmount,
      difference: -ledgerAmount,
      actualAt,
      importedAt: null,
      reason: "No old-system row points at this Capsule payment.",
    });
  }

  const groups = new Map<
    string,
    ReconciliationGroup & { s: number; l: number }
  >();
  const periods = new Map<
    string,
    ReconciliationPeriodTotal & { s: number; l: number; x: number }
  >();
  for (const line of lines) {
    const counted = line.result !== "excluded";
    const s = counted ? dollarsToCents(line.sourceAmount ?? 0) : 0;
    const l = counted ? dollarsToCents(line.ledgerAmount ?? 0) : 0;
    const groupKey = `${line.period}|${line.currency}|${line.result}`;
    const group = groups.get(groupKey) ?? {
      period: line.period,
      currency: line.currency,
      result: line.result,
      count: 0,
      sourceTotal: 0,
      ledgerTotal: 0,
      difference: 0,
      s: 0,
      l: 0,
    };
    group.count += 1;
    group.s += s;
    group.l += l;
    groups.set(groupKey, group);

    const periodKey = `${line.period}|${line.currency}`;
    const period = periods.get(periodKey) ?? {
      period: line.period,
      currency: line.currency,
      sourceTotal: 0,
      ledgerTotal: 0,
      difference: 0,
      excludedCount: 0,
      excludedTotal: 0,
      s: 0,
      l: 0,
      x: 0,
    };
    period.s += s;
    period.l += l;
    if (!counted) {
      period.excludedCount += 1;
      period.x += dollarsToCents(line.sourceAmount ?? 0);
    }
    periods.set(periodKey, period);
  }

  const byPeriod = (
    left: { period: string; currency: string },
    right: { period: string; currency: string },
  ) =>
    left.period.localeCompare(right.period) ||
    left.currency.localeCompare(right.currency);

  return {
    kind: "finance-reconciliation",
    generatedAt,
    from,
    to,
    periods: [...periods.values()]
      .map(({ s, l, x, ...period }) => ({
        ...period,
        sourceTotal: centsToDollars(s),
        ledgerTotal: centsToDollars(l),
        difference: centsToDollars(s - l),
        excludedTotal: centsToDollars(x),
      }))
      .sort(byPeriod),
    groups: [...groups.values()]
      .map(({ s, l, ...group }) => ({
        ...group,
        sourceTotal: centsToDollars(s),
        ledgerTotal: centsToDollars(l),
        difference: centsToDollars(s - l),
      }))
      .sort(
        (left, right) =>
          byPeriod(left, right) || left.result.localeCompare(right.result),
      ),
    discrepancies: lines
      .filter((line) => line.result !== "matched")
      .sort(
        (left, right) =>
          byPeriod(left, right) || left.key.localeCompare(right.key),
      ),
    matchedCount: lines.filter((line) => line.result === "matched").length,
  };
}

/** Reads a saved report back; anything else is not a reconciliation. */
export function readSavedReconciliation(
  definition: unknown,
): FinanceReconciliationReport | null {
  if (!definition || typeof definition !== "object") return null;
  const value = definition as Partial<FinanceReconciliationReport>;
  if (
    value.kind !== "finance-reconciliation" ||
    !Array.isArray(value.periods) ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.discrepancies)
  )
    return null;
  return value as FinanceReconciliationReport;
}
