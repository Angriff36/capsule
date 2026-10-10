// A QuickBooks payment report -> payment reference rows (AC-280).
// QuickBooks Online exports its reports (Transaction List by Date, Sales by
// Customer Detail, Deposit Detail ...) with a few title lines, one heading row
// (Date, Transaction type, Num, Name, Memo/Description, Amount), section and
// "Total for ..." lines. Each dated line becomes one row in the old-system
// payment shape (convex/tppParser.ts TppPaymentRecord), so it goes through
// the same classing and the same leftover match list as TPP payments.

import { interpretSerial } from "./tppReports/xlsxValues";

const key = (heading: string) =>
  heading.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Printed QuickBooks headings -> the part of the row each fills. */
const QBO_HEADINGS: Record<string, string> = {
  date: "date",
  transactiondate: "date",
  txndate: "date",
  transactiontype: "type",
  type: "type",
  num: "num",
  no: "num",
  refno: "num",
  name: "name",
  customer: "name",
  customerfullname: "name",
  receivedfrom: "name",
  memodescription: "memo",
  memo: "memo",
  description: "memo",
  paymentmethod: "method",
  amount: "amount",
  total: "amount",
  transactionid: "id",
  id: "id",
};

/** QuickBooks payment method words -> the old-system words the parser maps. */
const METHODS: Record<string, string> = {
  check: "Check",
  cheque: "Check",
  cash: "Cash",
  creditcard: "Credit Card",
  visa: "Credit Card",
  mastercard: "Credit Card",
  amex: "Credit Card",
  americanexpress: "Credit Card",
  discover: "Credit Card",
  ach: "ACH",
  banktransfer: "ACH",
  eft: "ACH",
};

/** "45923" (a sheet date number in an .xlsx) -> "YYYY-MM-DD"; other text as is. */
function lineDate(value: string): string {
  return /^\d{5}(\.\d+)?$/.test(value)
    ? (interpretSerial(Number(value), "1900").date ?? value)
    : value;
}

function headingRow(grid: ReadonlyArray<ReadonlyArray<string>>) {
  return grid.slice(0, 10).findIndex((cells) => {
    const parts = new Set(
      cells.map((cell) => QBO_HEADINGS[key(cell)]).filter(Boolean),
    );
    return parts.has("date") && parts.has("amount") && parts.has("type");
  });
}

/** True when the grid has a QuickBooks heading row (Date, type, Amount). */
export const isQuickBooksPaymentReport = (
  grid: ReadonlyArray<ReadonlyArray<string>>,
) => headingRow(grid) >= 0;

/**
 * One row per dated line. A line with no date (section heads, "Total for
 * ...", the report's own total) is left out: QuickBooks prints those as
 * sums of the dated lines. With no transaction id column, a line is known by
 * its date, type, number, name and amount, so the same report read twice, or
 * two reports that both list one payment, keep it once.
 */
export function quickBooksPaymentRowsFromGrid(
  grid: ReadonlyArray<ReadonlyArray<string>>,
): Record<string, string>[] {
  const start = headingRow(grid);
  if (start < 0) return [];
  const parts = grid[start]!.map((cell) => QBO_HEADINGS[key(cell)] ?? null);
  const rows: Record<string, string>[] = [];
  for (const cells of grid.slice(start + 1)) {
    const line: Record<string, string> = {};
    parts.forEach((part, index) => {
      const value = (cells[index] ?? "").trim();
      if (part && value && !line[part]) line[part] = value;
    });
    if (!line.date || !line.amount) continue;
    // "TOTAL" and "Total for ..." sit in the date column of total lines.
    line.date = lineDate(line.date);
    if (Number.isNaN(Date.parse(line.date))) continue;
    const name = line.name ?? "";
    const id =
      line.id ??
      `qbo:${line.date}:${line.type ?? ""}:${line.num ?? ""}:${name}:${line.amount.replace(/[$,\s]/g, "")}`;
    const row: Record<string, string> = {
      PaymentID: id,
      QuickBooksTransactionId: id,
      PaymentDate: line.date,
      PaymentAmount: line.amount,
      PaymentType: line.type ?? "",
      PaymentMethod: line.method
        ? (METHODS[key(line.method)] ?? line.method)
        : "",
    };
    if (line.num) row.Reference = `QuickBooks no. ${line.num}`;
    const notes = [name ? `Customer: ${name}` : "", line.memo ?? ""].filter(
      Boolean,
    );
    if (notes.length > 0) row.Notes = notes.join(" | ");
    if (name) row.CustomerName = name;
    rows.push(row);
  }
  return rows;
}
