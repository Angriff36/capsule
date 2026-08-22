import type { BundlePackListItem, EventBundlePart } from "./eventBundle";
import { findLabelledValue } from "./csvRows";
import { parseCount } from "./reportValues";

/**
 * Parses the TPP pack list — what leaves the building.
 *
 * The report prints two items per row, each followed by its own "For:" row and
 * free notes. Classification headings are indented single cells.
 */

const PRINTED_FOOTER = /^printed date:/i;
/** "(3.33 Each) |B05| Serving Tongs - Standard" */
const ITEM_LINE = /^\(([\d.]+)\s+([^)]*)\)\s*(?:\|([^|]*)\|)?\s*(.*)$/;

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

function splitForItems(value: string): string[] {
  return value
    .replace(/^For:\s*/i, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Parse a pack list CSV into its bundle contribution. */
export function parsePackList(rows: string[][]): EventBundlePart {
  const items: BundlePackListItem[] = [];
  let classification = "Unclassified";
  /** Items created by the row above, in column order, awaiting their notes. */
  let pending: BundlePackListItem[] = [];

  for (const row of rows) {
    const first = (row[0] ?? "").trim();
    if (PRINTED_FOOTER.test(first)) continue;

    const filled = row.filter((cell) => cell.trim().length > 0);
    if (filled.length === 0) continue;

    const parsedItems = row
      .map((cell) => cell.trim().match(ITEM_LINE))
      .filter((match): match is RegExpMatchArray => match !== null);

    if (parsedItems.length > 0) {
      pending = parsedItems.map((match) => {
        const item: BundlePackListItem = {
          classification,
          name: match[4]!.trim(),
          forItems: [],
        };
        const quantity = Number(match[1]);
        if (Number.isFinite(quantity)) item.quantity = quantity;
        const unit = match[2]?.trim();
        if (unit) item.unit = unit;
        const code = match[3]?.trim();
        if (code) item.code = code;
        return item;
      });
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
    header: {
      invoiceNumber: findLabelledValue(rows, "Invoice #"),
      title: findLabelledValue(rows, "Event Title"),
      guestCount: parseCount(findLabelledValue(rows, "Guest Count")),
      status: findLabelledValue(rows, "Status"),
      serviceStyle: findLabelledValue(rows, "Service Style"),
    },
    packList: items,
  };
}
