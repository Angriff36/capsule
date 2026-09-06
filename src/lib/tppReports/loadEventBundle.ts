import { readCsvRows } from "./csvRows";
import type {
  EventBundle,
  EventBundlePart,
  EventBundleSource,
} from "./eventBundle";
import { mergeEventBundle } from "./mergeEventBundle";
import { parseBattleBoard } from "./parseBattleBoard";
import { parseBeoWorkbook } from "./parseBeoWorkbook";
import { parseEventWorksheet } from "./parseEventWorksheet";
import { parseOrderList } from "./parseOrderList";
import { parsePackList } from "./parsePackList";
import { parseProductionWorksheet } from "./parseProductionWorksheet";
import { parseProposal } from "./parseProposal";
import { readPdfTextLines } from "./pdfTextReader";
import { readXlsxSheets } from "./xlsxReader";

/**
 * Turns raw report files into one event bundle.
 *
 * Reports are recognized by their content, not their file name, because the
 * names TPP exports vary per tenant. File reading stays with the caller so
 * this module has no dependency on the file system.
 */

export interface EventBundleFile {
  /** Name shown in messages. */
  name: string;
  contents: Buffer;
}

export interface EventBundleLoadResult {
  bundle: EventBundle;
  /** Which file was read as which report. */
  recognized: Array<{ name: string; source: EventBundleSource }>;
  /** Files whose shape matched no known report. */
  unrecognized: string[];
}

function detectCsvSource(
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

function parseOne(file: EventBundleFile): EventBundlePart | undefined {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return parseBattleBoard(readPdfTextLines(file.contents));
  }
  if (lower.endsWith(".xlsx")) {
    const sheets = readXlsxSheets(file.contents);
    const rows = sheets.flatMap((sheet) => sheet.rows);
    const source = detectWorkbookSource(rows);
    if (source === "beo") return parseBeoWorkbook(sheets);
    if (source === "productionWorksheet") {
      return parseProductionWorksheet(sheets);
    }
    return undefined;
  }
  if (!lower.endsWith(".csv")) return undefined;

  const text = file.contents.toString("utf8");
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

/** Read a set of TPP report files into one merged bundle. */
export function loadEventBundle(
  files: readonly EventBundleFile[],
): EventBundleLoadResult {
  const parts: EventBundlePart[] = [];
  const recognized: Array<{ name: string; source: EventBundleSource }> = [];
  const unrecognized: string[] = [];

  for (const file of files) {
    let part: EventBundlePart | undefined;
    try {
      part = parseOne(file);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      unrecognized.push(`${file.name} (${reason})`);
      continue;
    }
    if (part === undefined) {
      unrecognized.push(file.name);
      continue;
    }
    parts.push(part);
    recognized.push({ name: file.name, source: part.source });
  }

  const bundle = mergeEventBundle(parts);
  if (unrecognized.length > 0) {
    bundle.warnings.push(
      `These files were not recognized as TPP reports: ${unrecognized.join(", ")}.`,
    );
  }
  return { bundle, recognized, unrecognized };
}
