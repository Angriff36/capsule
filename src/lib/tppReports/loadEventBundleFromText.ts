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
import { packetEvidenceFromText } from "../eventPacket/packetContract";

/**
 * The browser's way in: pasted BEO / worksheet text plus any TPP CSV exports
 * the user dropped in. Everything here is plain strings, so it runs in the
 * page; the xlsx / pdf readers stay on the agent path.
 */

export interface TextReportSource {
  /** Name shown in messages, usually the file name. */
  name: string;
  text: string;
  /** An .xlsx export, already unzipped and read in the page; text is "". */
  sheets?: readonly XlsxSheet[];
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
      `These files were not recognized as TPP reports: ${unrecognized.join(", ")}. Excel (.xlsx) and CSV exports (BEO, Event Worksheet, Production Worksheet, Pack List, Proposal, Order List) are read here; .pdf goes through the agent bundle import.`,
    );
  }
  return { bundle, recognized, unrecognized };
}
