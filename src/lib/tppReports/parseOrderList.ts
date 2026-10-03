import type { BundleOrderLine, EventBundlePart } from "./eventBundle";
import {
  parseCount,
  parseQuantityWithUnit,
  parseReportDate,
} from "./reportValues";
import { interpretSerial } from "./xlsxValues";

/**
 * Parses the TPP order list and the Shopping List By Vendor export — what
 * must be bought, grouped by vendor.
 *
 * Each vendor section repeats the same column header, so the header row marks
 * the start of lines rather than the start of the report. Both reports put
 * the purchase amount in column 4 and the shelf (order) amount in column 7.
 * A missing unit stays missing (#274): it is never guessed.
 */

const COLUMN_HEADER = "Inventory";
const UNASSIGNED_VENDOR = /^\*.*\*$/;
const BRACKETED_VENDOR = /^\((.+)\)$/;
const CONTINUED = /\s*\(continued\.*\)\s*$/i;

function onlyCell(row: readonly string[]): string | undefined {
  const filled = row.filter((cell) => cell.trim().length > 0);
  return filled.length === 1 ? filled[0]!.trim() : undefined;
}

/**
 * The vendor a row starts, if it is a vendor heading. Order list CSV marks
 * them "Vendor -" or "*Unassigned*"; the Shopping List writes "(Unassigned)",
 * "US Foods (Continued...)" or the bare name right above a column header.
 */
function vendorHeading(
  row: readonly string[],
  nextRow: readonly string[] | undefined,
): string | undefined {
  const only = onlyCell(row);
  if (only === undefined) return undefined;
  if (UNASSIGNED_VENDOR.test(only)) return only.replace(/\*/g, "").trim();
  const bracketed = only.match(BRACKETED_VENDOR);
  if (bracketed) return bracketed[1]!.trim();
  const trailing = only.match(/^(.*?)\s*-\s*$/);
  if (trailing) return trailing[1]!.trim();
  if ((nextRow?.[0] ?? "").trim() === COLUMN_HEADER)
    return only.replace(CONTINUED, "").trim();
  return undefined;
}

/** "9/5/2026", or an Excel day number such as "46270" from a workbook. */
function reportDate(value: string | undefined): string | undefined {
  const text = value?.trim();
  if (text && /^\d{5}$/.test(text))
    return interpretSerial(Number(text), "1900").date;
  return parseReportDate(text);
}

/** The Shopping List writes an amount ("84 Each", "57.373875") in the stock
 * number column when the item has no stock number; that is not one. */
function stockNumberOf(cell: string | undefined): string | undefined {
  const text = (cell ?? "").trim();
  if (text.length === 0 || /^\d*\.\d+$/.test(text)) return undefined;
  return /^\d+(?:\.\d+)?\s+[a-z]/i.test(text) ? undefined : text;
}

/** Parse an order list or shopping list grid into its bundle contribution. */
export function parseOrderList(rows: string[][]): EventBundlePart {
  const lines: BundleOrderLine[] = [];
  let vendor = "Unassigned";
  let inSection = false;
  let header: Record<string, string> = {};
  let headerColumns: string[] | undefined;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const first = (row[0] ?? "").trim();

    if (first === "Event Date" && (row[1] ?? "").trim() === "Invoice #") {
      headerColumns = row.map((cell) => cell.trim());
      continue;
    }
    if (headerColumns) {
      const at = (label: string, fallback: number) => {
        const column = headerColumns!.indexOf(label);
        return (row[column >= 0 ? column : fallback] ?? "").trim();
      };
      header = {
        eventDate: first,
        invoiceNumber: at("Invoice #", 1),
        status: at("Status", 2),
        guestCount: at("Guest Count", 3),
        contact: at("Contact", 4),
      };
      headerColumns = undefined;
      continue;
    }

    const heading = vendorHeading(row, rows[index + 1]);
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
    // Page footers, printed inside a vendor section.
    if (
      first.startsWith("*") ||
      /^page \d/i.test(first) ||
      /^printed date/i.test(first)
    )
      continue;

    const order = parseQuantityWithUnit(row[6]);
    const purchase = parseQuantityWithUnit(row[3]);
    const line: BundleOrderLine = { vendor, inventoryItem: first };
    const stockNumber = stockNumberOf(row[1]);
    if (stockNumber !== undefined) line.stockNumber = stockNumber;
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
      eventDate: reportDate(header.eventDate),
      status: header.status || undefined,
      guestCount: parseCount(header.guestCount),
    },
    client: header.contact ? { name: header.contact } : {},
    orderLines: lines,
  };
}
