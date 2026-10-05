import { bundlePartFromSheets } from "./bundlePartFromSheets";
import { parseCsvReportText } from "./csvReports";
import type { XlsxSheet } from "./xlsxWorkbookParser";
import type {
  EventBundle,
  EventBundlePart,
  EventBundleSource,
} from "./eventBundle";
import { mergeEventBundle } from "./mergeEventBundle";
import { parseBeoText } from "./parseBeoText";
import { bundlePartFromPdfLines } from "./pdfReports";
import type { PdfTextLine } from "./pdfTextReader";
import { packetEvidenceFromText } from "../eventPacket/packetContract";

/**
 * The browser's way in: pasted BEO / worksheet text plus any TPP exports
 * the user dropped in. Files arrive already read in the page (CSV text, an
 * unzipped .xlsx, a PDF's text lines), so everything here runs in the page.
 */

export interface TextReportSource {
  /** Name shown in messages, usually the file name. */
  name: string;
  text: string;
  /** An .xlsx export, already unzipped and read in the page; text is "". */
  sheets?: readonly XlsxSheet[];
  /** A report printed to PDF, its text lines read in the page; text is "". */
  pdfLines?: readonly PdfTextLine[];
}

export interface TextBundleLoadResult {
  bundle: EventBundle;
  recognized: Array<{ name: string; source: EventBundleSource }>;
  unrecognized: string[];
}

export function loadEventBundleFromText(input: {
  pastedText?: string;
  csvFiles?: readonly TextReportSource[];
  packetFiles?: readonly TextReportSource[];
}): TextBundleLoadResult {
  const parts: EventBundlePart[] = [];
  const recognized: TextBundleLoadResult["recognized"] = [];
  const unrecognized: string[] = [];

  const pasted = input.pastedText?.trim() ?? "";
  if (pasted.length > 0) {
    const part = parseBeoText(pasted);
    parts.push(part);
    recognized.push({ name: "Pasted text", source: part.source });
  }

  for (const file of [
    ...(input.csvFiles ?? []),
    ...(input.packetFiles ?? []),
  ]) {
    let part: EventBundlePart | undefined;
    try {
      if (file.pdfLines) {
        part = bundlePartFromPdfLines(file.pdfLines);
        if (part === undefined) unrecognized.push(file.name);
        else {
          parts.push(part);
          recognized.push({ name: file.name, source: part.source });
        }
        continue;
      }
      if (file.sheets) {
        part = bundlePartFromSheets(file.sheets);
        if (part === undefined) unrecognized.push(file.name);
        else {
          parts.push(part);
          recognized.push({ name: file.name, source: part.source });
        }
        continue;
      }
      const packetEvidence = packetEvidenceFromText(file.text);
      part = packetEvidence
        ? { source: "eventPacket", packetEvidence }
        : parseCsvReportText(file.text);
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
      `These files were not recognized as TPP reports: ${unrecognized.join(", ")}. PDF, Excel (.xlsx) and CSV reports (BEO, Event Worksheet, Production Worksheet, Pack List, Event Menu, Battle Board, Proposal, Order List) are read here.`,
    );
  }
  return { bundle, recognized, unrecognized };
}
