import { parseCsvReportText, parseRowReport } from "./csvReports";
import type {
  EventBundle,
  EventBundlePart,
  EventBundleSource,
} from "./eventBundle";
import { mergeEventBundle } from "./mergeEventBundle";
import { parseBattleBoard } from "./parseBattleBoard";
import { parseBeoText } from "./parseBeoText";
import { beoPdfText, isBeoPdf } from "./beoPdfText";
import { bundlePartFromSheets } from "./bundlePartFromSheets";
import { parseEventWorksheet } from "./parseEventWorksheet";
import { isEventWorksheetPdf, worksheetPdfRows } from "./worksheetPdfRows";
import { isPackListPdf, parsePackListPdf } from "./packListPdf";
import { isEventMenuPdf, parseEventMenuPdf } from "./eventMenuPdf";
import { isRtf, rtfToText } from "./rtfToText";
import { readPdfTextLines } from "./pdfTextReader";
import { readXlsxWorkbook } from "./xlsxReader";
import { XlsxReportGrid } from "./xlsxReportGrid";
import { packetEvidenceFromText } from "../eventPacket/packetContract";

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

export { detectWorkbookSource } from "./bundlePartFromSheets";

function parseOne(file: EventBundleFile): EventBundlePart | undefined {
  const lower = file.name.toLowerCase();
  const head = file.contents.toString("latin1", 0, 128);
  if (isRtf(head)) {
    // TPP saves the BEO as Rich Text too (as the import page reads it).
    return parseBeoText(rtfToText(file.contents.toString("latin1")));
  }
  if (file.contents.toString("utf8", 0, 128).trimStart().startsWith("{")) {
    const packetEvidence = packetEvidenceFromText(
      file.contents.toString("utf8"),
    );
    if (packetEvidence) return { source: "eventPacket", packetEvidence };
  }

  if (lower.endsWith(".pdf")) {
    const lines = readPdfTextLines(file.contents);
    // TPP prints the BEO, the event worksheet and the pack list as PDF too;
    // any other PDF is the battle board.
    if (isBeoPdf(lines)) return parseBeoText(beoPdfText(lines));
    if (isEventWorksheetPdf(lines))
      return parseEventWorksheet(worksheetPdfRows(lines));
    if (isPackListPdf(lines)) return parsePackListPdf(lines);
    if (isEventMenuPdf(lines)) return parseEventMenuPdf(lines);
    return parseBattleBoard(lines);
  }
  if (lower.endsWith(".xlsx")) {
    // Typed read: date cells print as M/D/YYYY and format-literal units ride
    // along with their numbers, so a report exported as a workbook reads the
    // same as the CSV TPP prints (issue #274).
    return bundlePartFromSheets(
      XlsxReportGrid.fromWorkbook(readXlsxWorkbook(file.contents)),
    );
  }
  if (!lower.endsWith(".csv")) return undefined;
  return parseCsvReportText(file.contents.toString("utf8"));
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
