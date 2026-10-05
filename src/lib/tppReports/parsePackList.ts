import type { BundlePackListItem, EventBundlePart } from "./eventBundle";
import { findLabelledValue } from "./csvRows";
import { parseCount, parseReportDate } from "./reportValues";

/**
 * Parses the TPP pack list — what leaves the building.
 *
 * The report prints two items per row, each followed by its own "For:" row and
 * free notes. Classification headings are indented single cells.
 */

const PRINTED_FOOTER = /^printed date:/i;
/** "(3.33 Each) |B05| Serving Tongs - Standard" */
const ITEM_LINE = /^\(([\d.]+)\s+([^)]*)\)\s*(?:\|([^|]*)\|)?\s*(.*)$/;
/** The labels TPP repeats at the top of every printed page. */
const PAGE_HEADER =
  /^(pack list|grouped by:|event date:|contact:|event title:|invoice #:|status:)/i;

/** One pack-list line from its printed "(qty unit) |code| name" text. */
export function packListItem(
  text: string,
  classification: string,
  forItems: string[],
): BundlePackListItem | undefined {
  const match = text.trim().match(ITEM_LINE);
  if (!match) return undefined;
  const item: BundlePackListItem = {
    classification,
    name: match[4]!.trim(),
    forItems,
  };
  const quantity = Number(match[1]);
  if (Number.isFinite(quantity)) item.quantity = quantity;
  const unit = match[2]?.trim();
  if (unit) item.unit = unit;
  const code = match[3]?.trim();
  if (code) item.code = code;
  return item;
}

/** The event facts printed at the top of every pack list page. */
export function packListHeader(
  rows: readonly (readonly string[])[],
): EventBundlePart["header"] {
  return {
    invoiceNumber: findLabelledValue(rows, "Invoice #"),
    title: findLabelledValue(rows, "Event Title"),
    eventDate: parseReportDate(findLabelledValue(rows, "Event Date")),
    guestCount: parseCount(findLabelledValue(rows, "Guest Count")),
    status: findLabelledValue(rows, "Status"),
    serviceStyle: findLabelledValue(rows, "Service Style"),
  };
}

/**
 * TPP marks a classification heading by indenting it, and by nothing else.
 * `readCsvRows` keeps one leading space on indented cells for exactly this.
 */
function classificationOf(row: readonly string[]): string | undefined {
  const filled = row.filter((cell) => cell.trim().length > 0);
  if (filled.length !== 1) return undefined;
  const only = filled[0]!;
  return /^[ \t]/.test(only) ? only.trim() : undefined;
}

export function splitForItems(value: string): string[] {
  return value
    .replace(/^For:\s*/i, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * The workbook export prints the pack list grouped under each menu item: a
 * lone "Menu Items" cell, then the dish name as a lone, un-indented cell and
 * its items under it. That dish name is the group AND what the items are for.
 */
function looksLikeDishHeading(row: readonly string[]): string | undefined {
  const filled = row.filter((cell) => cell.trim().length > 0);
  if (filled.length !== 1) return undefined;
  const text = filled[0]!.trim();
  if (
    /^(For:|Menu Items$|Pack List|Print(?:ed)? Date|Page\b|Grouped by)/i.test(
      text,
    )
  )
    return undefined;
  const words = text.split(/\s+/);
  if (words.length > 8 || /[.;!?]$/.test(text) || !/^[A-Z0-9]/.test(text))
    return undefined;
  return text;
}

/** Parse a pack list CSV into its bundle contribution. */
export function parsePackList(rows: string[][]): EventBundlePart {
  const items: BundlePackListItem[] = [];
  let classification = "Unclassified";
  let forDish: string | undefined;
  const groupedByMenuItem = rows.some(
    (row) =>
      row.filter((cell) => cell.trim().length > 0).length === 1 &&
      row.some((cell) => cell.trim() === "Menu Items"),
  );
  /** Items created by the row above, in column order, awaiting their notes. */
  let pending: BundlePackListItem[] = [];

  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    if (PRINTED_FOOTER.test(first) || /^Print Date:?$/i.test(first)) continue;

    const filled = row.filter((cell) => cell.trim().length > 0);
    if (filled.length === 0) continue;
    // A repeated page header is not a note on the item above it.
    if (PAGE_HEADER.test(filled[0]!.trim())) continue;

    if (groupedByMenuItem) {
      const dish = looksLikeDishHeading(row);
      if (dish !== undefined) {
        classification = dish;
        forDish = dish;
        pending = [];
        continue;
      }
    }

    const parsedItems = row.flatMap((cell) => {
      const item = packListItem(
        cell,
        classification,
        forDish === undefined ? [] : [forDish],
      );
      return item ? [item] : [];
    });

    if (parsedItems.length > 0) {
      pending = parsedItems;
      items.push(...pending);
      continue;
    }

    if (pending.length > 0 && filled.some((cell) => /^For:/i.test(cell))) {
      const targets = filled.filter((cell) => /^For:/i.test(cell));
      targets.forEach((cell, index) => {
        const item = pending[index] ?? pending[0];
        if (item) item.forItems.push(...splitForItems(cell));
      });
      continue;
    }

    const heading = classificationOf(row);
    if (heading !== undefined) {
      classification = heading;
      pending = [];
      continue;
    }

    if (pending.length > 0) {
      filled.forEach((cell, index) => {
        const item = pending[index] ?? pending[0];
        if (!item) return;
        const note = cell.trim();
        item.notes = item.notes === undefined ? note : `${item.notes} ${note}`;
      });
    }
  }

  return {
    source: "packList",
    header: packListHeader(rows),
    packList: items,
  };
}
