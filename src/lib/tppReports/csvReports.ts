import { readCsvRows } from "./csvRows";
import type { EventBundlePart, EventBundleSource } from "./eventBundle";
import { parseEventWorksheet } from "./parseEventWorksheet";
import { parseOrderList } from "./parseOrderList";
import { parsePackList } from "./parsePackList";
import { parseProposal } from "./parseProposal";

/**
 * The CSV half of the report loader. Kept apart from the xlsx/pdf readers
 * because it needs no Node APIs, so the browser importer can use it as is.
 */

export function detectCsvSource(
  rows: readonly (readonly string[])[],
): EventBundleSource | undefined {
  const head = rows
    .slice(0, 12)
    .map((row) => row.join(" ").toLowerCase())
    .join(" | ");

  if (head.includes("event worksheet")) return "eventWorksheet";
  if (head.includes("pack list")) return "packList";
  if (head.includes("order list")) return "orderList";
  if (head.includes("prepared for")) return "proposal";
  return undefined;
}

/** Parse one CSV report by its content; undefined when it matches no report. */
export function parseCsvReportText(text: string): EventBundlePart | undefined {
  const source = detectCsvSource(readCsvRows(text));
  switch (source) {
    case "eventWorksheet":
      return parseEventWorksheet(readCsvRows(text));
    case "packList":
      // Classification headings are marked by indentation alone.
      return parsePackList(readCsvRows(text, { keepIndentMarker: true }));
    case "orderList":
      return parseOrderList(readCsvRows(text));
    case "proposal":
      return parseProposal(readCsvRows(text));
    default:
      return undefined;
  }
}
