/**
 * PR05-03 / AC-086: rebuild each old invoice from the records an import kept,
 * as a preview. It shows what the old records say — client and event, invoice
 * number, currency, lines, tax, service charge, deposits, payments, refunds,
 * credits, dates and what was still owed — and names every piece the old
 * records do not have. A missing piece stays missing: no line, tax or total is
 * made up to fill the gap.
 *
 * Money is added in whole cents so totals match to the cent.
 */
import type { FinancialRowClass } from "./financialRowClass";

export interface ReconstructionEvent {
  /** The old system's event id. */
  sourceEventId: string;
  /** The Capsule event it became, when the import made one. */
  eventId?: string | null;
  /** The Capsule client, when the old client was brought over. */
  clientId?: string | null;
  title?: string | null;
  startsAt?: number | null;
  /** The old event's price. */
  quotedRevenue?: number | null;
  depositAmount?: number | null;
}

export interface ReconstructionMoneyRow {
  rowId: string;
  invoiceNumber?: string | null;
  sourceEventId?: string | null;
  amount: number;
  rowClass: FinancialRowClass;
  /** The source's own type words, e.g. "Deposit". */
  paymentType?: string | null;
  recordedAt?: number | null;
  /** Set when an overlapping report already counted this money. */
  sameMoneyAs?: string | null;
}

/** Lines and tax from the Capsule event's proposal, when it has one. */
export interface ReconstructionEventDetail {
  source: string;
  lines: { description: string; amount: number }[];
  taxAmount?: number | null;
}

export interface ReconstructionInput {
  events: ReconstructionEvent[];
  moneyRows: ReconstructionMoneyRow[];
  /** Keyed by Capsule event id. */
  eventDetail?: Record<string, ReconstructionEventDetail>;
  /** The company's own currency; the old records name none. */
  companyCurrency: string;
}

export interface ReconstructedMoney {
  rowId: string;
  amount: number;
  date: number | null;
  label: string;
}

export interface ReconstructedInvoice {
  /** Old invoice number, or "event:<old event id>" when there is none. */
  key: string;
  invoiceNumber: string | null;
  sourceEventIds: string[];
  eventId: string | null;
  eventTitle: string | null;
  clientId: string | null;
  currency: { code: string; fromOldRecords: boolean };
  lines: { description: string; amount: number }[];
  linesFrom: string | null;
  taxAmount: number | null;
  serviceCharge: number | null;
  total: number | null;
  totalFrom: string | null;
  deposits: ReconstructedMoney[];
  payments: ReconstructedMoney[];
  refunds: ReconstructedMoney[];
  credits: ReconstructedMoney[];
  /** Processing fees and tips: kept, never part of what the client owes. */
  feesAndTips: ReconstructedMoney[];
  /** Rows an overlapping report already counted under another row. */
  countedOnce: ReconstructedMoney[];
  /** The date the invoice counts from: its invoice row, else the event day. */
  effectiveDate: number | null;
  paid: number;
  unpaidBalance: number | null;
  /** The old system's own balance line, when it has one. */
  oldBalance: number | null;
  /** Plain words for every piece the old records do not give. */
  missing: string[];
  rowIds: string[];
}

const cents = (amount: number) => Math.round(amount * 100);
const dollars = (value: number) => value / 100;
const DEPOSIT = /\b(deposit|retainer)\b/i;
const SERVICE_CHARGE = /\bservice\s*charge\b/i;

interface Group {
  key: string;
  invoiceNumber: string | null;
  sourceEventIds: Set<string>;
  rows: ReconstructionMoneyRow[];
}

function money(row: ReconstructionMoneyRow, label: string): ReconstructedMoney {
  return {
    rowId: row.rowId,
    amount: dollars(Math.abs(cents(row.amount))),
    date: row.recordedAt ?? null,
    label,
  };
}

const sumCents = (items: ReconstructedMoney[]) =>
  items.reduce((total, item) => total + cents(item.amount), 0);

function groupRows(input: ReconstructionInput): Group[] {
  const groups = new Map<string, Group>();
  const eventGroup = new Map<string, string>();
  const groupFor = (key: string, invoiceNumber: string | null) => {
    let group = groups.get(key);
    if (!group) {
      group = { key, invoiceNumber, sourceEventIds: new Set(), rows: [] };
      groups.set(key, group);
    }
    return group;
  };
  for (const row of input.moneyRows) {
    const invoiceNumber = row.invoiceNumber?.trim() || null;
    if (!invoiceNumber && !row.sourceEventId) continue; // report-wide lines
    const key = invoiceNumber ?? `event:${row.sourceEventId}`;
    const group = groupFor(key, invoiceNumber);
    group.rows.push(row);
    if (row.sourceEventId) {
      group.sourceEventIds.add(row.sourceEventId);
      if (invoiceNumber && !eventGroup.has(row.sourceEventId))
        eventGroup.set(row.sourceEventId, key);
    }
  }
  // Rows with only an event id join that event's invoice when it has one.
  for (const [key, group] of groups) {
    if (group.invoiceNumber) continue;
    const eventId = [...group.sourceEventIds][0];
    const target = eventId ? eventGroup.get(eventId) : undefined;
    if (!target) continue;
    groups.get(target)!.rows.push(...group.rows);
    groups.delete(key);
  }
  // An old event with a price but no money rows is still an invoice to rebuild.
  for (const event of input.events) {
    const inGroup = [...groups.values()].some((group) =>
      group.sourceEventIds.has(event.sourceEventId),
    );
    if (inGroup || event.quotedRevenue == null) continue;
    groupFor(`event:${event.sourceEventId}`, null).sourceEventIds.add(
      event.sourceEventId,
    );
  }
  return [...groups.values()];
}

function rebuild(
  group: Group,
  input: ReconstructionInput,
  events: Map<string, ReconstructionEvent>,
): ReconstructedInvoice {
  const missing: string[] = [];
  const linked = [...group.sourceEventIds]
    .map((id) => events.get(id))
    .filter((event): event is ReconstructionEvent => event != null);
  const event = linked.find((row) => row.eventId) ?? linked[0] ?? null;
  const detail = event?.eventId ? input.eventDetail?.[event.eventId] : null;

  const deposits: ReconstructedMoney[] = [];
  const payments: ReconstructedMoney[] = [];
  const refunds: ReconstructedMoney[] = [];
  const credits: ReconstructedMoney[] = [];
  const feesAndTips: ReconstructedMoney[] = [];
  const countedOnce: ReconstructedMoney[] = [];
  const invoiceRows: ReconstructionMoneyRow[] = [];
  let oldBalance: number | null = null;
  let oldBalanceAt = -Infinity;
  for (const row of group.rows) {
    if (row.sameMoneyAs) {
      countedOnce.push(money(row, `same money as ${row.sameMoneyAs}`));
      continue;
    }
    switch (row.rowClass) {
      case "payment":
        if (row.amount < 0) refunds.push(money(row, "money paid back"));
        else if (DEPOSIT.test(row.paymentType ?? ""))
          deposits.push(money(row, "deposit"));
        else payments.push(money(row, "payment"));
        break;
      case "refund_return":
        refunds.push(money(row, "refund or returned payment"));
        break;
      case "credit":
        credits.push(money(row, "credit"));
        break;
      case "fee":
        feesAndTips.push(money(row, "processing fee"));
        break;
      case "gratuity":
        feesAndTips.push(money(row, "tip"));
        break;
      case "invoice":
        invoiceRows.push(row);
        break;
      case "balance_snapshot":
        if ((row.recordedAt ?? 0) >= oldBalanceAt) {
          oldBalanceAt = row.recordedAt ?? 0;
          oldBalance = dollars(cents(row.amount));
        }
        break;
      default:
        // Quotes, payments applied and report totals describe money counted
        // elsewhere; they never add to this invoice.
        break;
    }
  }

  const lines = detail?.lines ?? [];
  const serviceCharge = detail
    ? dollars(
        lines
          .filter((line) => SERVICE_CHARGE.test(line.description))
          .reduce((total, line) => total + cents(line.amount), 0),
      )
    : null;
  const taxAmount = detail?.taxAmount ?? null;
  if (!detail) {
    missing.push("line items (the old records list none)");
    missing.push("service charge (not in the old records)");
  } else if (lines.length === 0) {
    missing.push("line items (the event's proposal has none)");
  }
  if (taxAmount == null) missing.push("tax (not in the old records)");

  // The invoice's own row is the best total; then the old event's price.
  const latestInvoice = [...invoiceRows].sort(
    (a, b) => (b.recordedAt ?? 0) - (a.recordedAt ?? 0),
  )[0];
  let total: number | null = null;
  let totalFrom: string | null = null;
  if (latestInvoice) {
    total = dollars(cents(latestInvoice.amount));
    totalFrom = `old invoice row ${latestInvoice.rowId}`;
  } else if (event?.quotedRevenue != null) {
    total = dollars(cents(event.quotedRevenue));
    totalFrom = "old event price";
  } else {
    missing.push("invoice total (no invoice row and no event price)");
  }

  const paidCents = sumCents(deposits) + sumCents(payments) - sumCents(refunds);
  const unpaidBalance =
    total == null
      ? null
      : dollars(cents(total) - paidCents - sumCents(credits));
  if (
    oldBalance != null &&
    unpaidBalance != null &&
    oldBalance !== unpaidBalance
  )
    missing.push(
      `old balance line says ${oldBalance.toFixed(2)}, the rows add up to ${unpaidBalance.toFixed(2)}`,
    );

  const effectiveDate = latestInvoice?.recordedAt ?? event?.startsAt ?? null;
  if (effectiveDate == null) missing.push("invoice date");
  if (!group.invoiceNumber)
    missing.push("invoice number (the old records have none)");
  if (!event) missing.push("event (the old event was not brought over)");
  else if (!event.eventId)
    missing.push("Capsule event (the old event was brought over without one)");
  if (!event?.clientId)
    missing.push("client (the old client was not brought over)");
  missing.push(
    `currency (the old records name none; using the company currency ${input.companyCurrency})`,
  );
  if (
    event?.depositAmount != null &&
    event.depositAmount > 0 &&
    deposits.length === 0
  )
    missing.push(
      `deposit payment (the old event asked for ${event.depositAmount.toFixed(2)}; no deposit row found)`,
    );

  return {
    key: group.key,
    invoiceNumber: group.invoiceNumber,
    sourceEventIds: [...group.sourceEventIds].sort(),
    eventId: event?.eventId ?? null,
    eventTitle: event?.title ?? null,
    clientId: event?.clientId ?? null,
    currency: { code: input.companyCurrency, fromOldRecords: false },
    lines,
    linesFrom: detail?.source ?? null,
    taxAmount,
    serviceCharge,
    total,
    totalFrom,
    deposits,
    payments,
    refunds,
    credits,
    feesAndTips,
    countedOnce,
    effectiveDate,
    paid: dollars(paidCents),
    unpaidBalance,
    oldBalance,
    missing,
    rowIds: group.rows.map((row) => row.rowId).sort(),
  };
}

/** Every old invoice the kept records describe, newest first. */
export function previewLedgerReconstruction(
  input: ReconstructionInput,
): ReconstructedInvoice[] {
  const events = new Map(
    input.events.map((event) => [event.sourceEventId, event]),
  );
  return groupRows(input)
    .map((group) => rebuild(group, input, events))
    .sort(
      (a, b) =>
        (b.effectiveDate ?? 0) - (a.effectiveDate ?? 0) ||
        a.key.localeCompare(b.key),
    );
}
