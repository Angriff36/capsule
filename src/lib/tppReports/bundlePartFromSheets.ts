import { parseRowReport } from "./csvReports";
import type { EventBundlePart, EventBundleSource } from "./eventBundle";
import { parseBeoWorkbook } from "./parseBeoWorkbook";
import { parseProductionWorksheet } from "./parseProductionWorksheet";
import type { XlsxSheet } from "./xlsxWorkbookParser";

/** Which TPP report a workbook grid is, from its first rows. */
export function detectWorkbookSource(
  rows: readonly (readonly string[])[],
): EventBundleSource | undefined {
  const head = rows
    .slice(0, 12)
    .map((row) => row.join(" ").toLowerCase())
    .join(" | ");

  if (head.includes("banquet event order")) return "beo";
  if (head.includes("category") && head.includes("quantity/unit")) {
    return "productionWorksheet";
  }
  if (head.includes("site:")) return "productionWorksheet";
  return undefined;
}

/**
 * A report exported from TPP as a workbook, read into its bundle part. The
 * agent file loader and the browser import page both call this, so an
 * .xlsx gives the same answer on both paths.
 */
export function bundlePartFromSheets(
  sheets: readonly XlsxSheet[],
): EventBundlePart | undefined {
  const rows = sheets.flatMap((sheet) => sheet.rows);
  const source = detectWorkbookSource(rows);
  if (source === "beo") return parseBeoWorkbook(sheets);
  if (source === "productionWorksheet") return parseProductionWorksheet(sheets);
  // The row-shaped reports (worksheet, pack list, order list, proposal)
  // are the same grid whether TPP exported CSV or a workbook.
  return parseRowReport(rows);
}
