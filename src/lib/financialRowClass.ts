/**
 * PR05-01 / AC-084: every imported money row gets one class, and only rows
 * that move money of their own may wait to be matched to a Capsule payment.
 * Quotes, invoices, allocations, credits, balances and report totals describe
 * money counted elsewhere; they are kept as reference only, so two reports
 * that overlap can never both count the same money.
 */
export type FinancialRowClass =
  | "quote"
  | "invoice"
  | "payment"
  | "allocation"
  | "refund_return"
  | "fee"
  | "gratuity"
  | "credit"
  | "balance_snapshot"
  | "aggregate_report";

/** Classes that are money moving on their own (cash in or out). */
const MONEY_CLASSES = new Set<FinancialRowClass>([
  "payment",
  "refund_return",
  "fee",
  "gratuity",
]);

/** Plain words shown on the kept row. */
export const FINANCIAL_ROW_LABEL: Record<FinancialRowClass, string> = {
  quote: "quote",
  invoice: "invoice",
  payment: "payment",
  allocation: "payment applied to an invoice",
  refund_return: "refund or returned payment",
  fee: "processing fee",
  gratuity: "tip",
  credit: "credit",
  balance_snapshot: "balance on a date",
  aggregate_report: "report total",
};

// First match wins. "Balance payment" and "deposit" are payments; a total
// line is a report total even when it totals payments.
const RULES: [FinancialRowClass, RegExp][] = [
  ["aggregate_report", /\b(grand\s*total|sub-?total|totals?|summary)\b/i],
  ["refund_return", /\b(refund\w*|return(ed)?|chargeback|reversal|nsf)\b/i],
  ["allocation", /\b(allocat\w*|applied|application)\b/i],
  ["payment", /\b(payments?|deposit|retainer)\b/i],
  ["balance_snapshot", /\b(balance|outstanding|amount\s*due)\b/i],
  ["quote", /\b(quote|estimate|proposal)\b/i],
  ["invoice", /\b(invoice|billed)\b/i],
  ["gratuity", /\b(tips?|gratuity)\b/i],
  ["fee", /\b(fees?|surcharge|processing)\b/i],
  [
    "credit",
    /\b(credit\s*memo|store\s*credit|account\s*credit|credit(?!\s*card))\b/i,
  ],
];
/** Only these two read from the row id: report lines often have no type. */
const ID_RULES = RULES.filter(
  ([c]) => c === "aggregate_report" || c === "balance_snapshot",
);

/**
 * The class of one source row. The row's type column decides; a row whose
 * id reads like a total or balance is that report line; a payment with a
 * negative amount is money going back out.
 */
export function classifyFinancialRow(row: {
  type?: string | null;
  id?: string | null;
  amount: number;
}): { rowClass: FinancialRowClass; movesMoney: boolean } {
  const type = (row.type ?? "").trim();
  const id = (row.id ?? "").trim();
  const byType = type
    ? RULES.find(([, rule]) => rule.test(type))?.[0]
    : undefined;
  const byId = ID_RULES.find(([, rule]) => rule.test(id))?.[0];
  let rowClass: FinancialRowClass = byId ?? byType ?? "payment";
  if (rowClass === "payment" && row.amount < 0) rowClass = "refund_return";
  return {
    rowClass,
    movesMoney: MONEY_CLASSES.has(rowClass) && row.amount !== 0,
  };
}
