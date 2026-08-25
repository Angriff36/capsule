import type { BundleOrderLine, EventBundlePart } from "./eventBundle";
import {
  parseCount,
  parseQuantityWithUnit,
  parseReportDate,
} from "./reportValues";

/**
 * Parses the TPP order list — what must be bought, grouped by vendor.
 *
 * Each vendor section repeats the same column header, so the header row marks
 * the start of lines rather than the start of the report.
 */

const COLUMN_HEADER = "Inventory";
const UNASSIGNED_VENDOR = /^\*.*\*$/;

function isVendorHeading(row: readonly string[]): string | undefined {
  const filled = row.filter((cell) => cell.trim().length > 0);
  if (filled.length !== 1) return undefined;
  const only = filled[0]!.trim();
  if (UNASSIGNED_VENDOR.test(only)) return only.replace(/\*/g, "").trim();
  const trailing = only.match(/^(.*?)\s*-\s*$/);
  return trailing?.[1]?.trim();
}

/** Parse an order list CSV into its bundle contribution. */
export function parseOrderList(rows: string[][]): EventBundlePart {
  const lines: BundleOrderLine[] = [];
  let vendor = "Unassigned";
  let inSection = false;
  let header: Record<string, string> = {};

  for (const row of rows) {
    const first = (row[0] ?? "").trim();

    if (first === "Event Date" && row[1] === "Invoice #") {
      header = { headerRowFollows: "yes" };
      continue;
    }
    if (header.headerRowFollows === "yes") {
      header = {
        eventDate: first,
        invoiceNumber: (row[1] ?? "").trim(),
        status: (row[2] ?? "").trim(),
        guestCount: (row[3] ?? "").trim(),
        contact: (row[4] ?? "").trim(),
      };
      continue;
    }

    const heading = isVendorHeading(row);
    if (heading !== undefined && heading.length > 0) {
      vendor = heading;
      inSection = false;
      continue;
    }
    if (first === COLUMN_HEADER) {
      inSection = true;
      continue;
    }
    if (!inSection || first.length === 0) continue;
    // Page footer, printed inside a vendor section.
    if (first.startsWith("*") || /^page \d/i.test(first)) continue;

    const order = parseQuantityWithUnit(row[6]);
    const purchase = parseQuantityWithUnit(row[3]);
    const line: BundleOrderLine = { vendor, inventoryItem: first };
    const stockNumber = (row[1] ?? "").trim();
    if (stockNumber.length > 0) line.stockNumber = stockNumber;
    const forItem = (row[2] ?? "").trim();
    if (forItem.length > 0) line.forItem = forItem;
    if (order) {
      line.orderQuantity = order.quantity;
      if (order.unit !== undefined) line.orderUnit = order.unit;
    }
    if (purchase) {
      line.purchaseQuantity = purchase.quantity;
      if (purchase.unit !== undefined) line.purchaseUnit = purchase.unit;
    }
    lines.push(line);
  }

  return {
    source: "orderList",
    header: {
      invoiceNumber: header.invoiceNumber || undefined,
      eventDate: parseReportDate(header.eventDate),
      status: header.status || undefined,
      guestCount: parseCount(header.guestCount),
    },
    client: header.contact ? { name: header.contact } : {},
    orderLines: lines,
  };
}
