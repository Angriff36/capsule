import { detectWorkbookSource } from "./loadEventBundle";
import { readXlsxSheets } from "./xlsxReader";

/**
 * Workbook disposition classification for the import archive (PR01-02).
 *
 * Every workbook of an uploaded archive ends in exactly one disposition and
 * every source row lands in exactly one counted outcome — the buckets always
 * sum to totalRowCount, so no row is silently dropped. Header and summary
 * rows are counted separately from data outcomes. A source artifact is
 * evidence about the source: "normalized" here means this walk could account
 * for the row, not that a business record was created (that is PR02+).
 *
 * Row outcomes reuse the real report parsers' vocabulary (loadEventBundle
 * detects the report by content; parseBeoWorkbook reads labelled rows), so
 * rows the label/value walk cannot account for surface as needs_mapping —
 * the input queue for source-identity mapping — instead of disappearing.
 */

export type WorkbookDisposition =
  | "normalized"
  | "linked_reference"
  | "duplicate_view"
  | "needs_mapping"
  | "unsupported"
  | "invalid";

export type WorkbookRowOutcome =
  "header" | "summary" | "normalized" | "needs_mapping" | "unsupported";

export interface WorkbookClassification {
  disposition: WorkbookDisposition;
  parseStatus: "parsed" | "failed";
  totalRowCount: number;
  rowOutcomeCounts: Partial<Record<WorkbookRowOutcome, number>>;
}

/** Footer/summary labels the report parsers treat as trailing prose. */
const SUMMARY_ROW =
  /^(printed date|total|subtotal|balance|prepared by|signature)/i;

function rowText(row: readonly string[]): string {
  return row.join(" ").replace(/\s+/g, " ").trim();
}

/** Classify one workbook's bytes into the disposition taxonomy. */
export function classifyWorkbook(buffer: Buffer): WorkbookClassification {
  let sheets: ReturnType<typeof readXlsxSheets>;
  try {
    sheets = readXlsxSheets(buffer);
  } catch {
    // Corrupt container: nothing readable to count — accounted as invalid.
    return {
      disposition: "invalid",
      parseStatus: "failed",
      totalRowCount: 0,
      rowOutcomeCounts: {},
    };
  }
  if (sheets.length === 0) {
    // A real workbook has at least one worksheet; zero means broken content.
    return {
      disposition: "invalid",
      parseStatus: "parsed",
      totalRowCount: 0,
      rowOutcomeCounts: {},
    };
  }

  const rows = sheets.flatMap((sheet) => sheet.rows);
  if (detectWorkbookSource(rows) === undefined) {
    // Shape matches no known report — still counted, never dropped.
    return {
      disposition: "unsupported",
      parseStatus: "parsed",
      totalRowCount: rows.length,
      rowOutcomeCounts: { unsupported: rows.length },
    };
  }

  const counts: Record<WorkbookRowOutcome, number> = {
    header: 0,
    summary: 0,
    normalized: 0,
    needs_mapping: 0,
    unsupported: 0,
  };
  for (const row of rows) {
    const text = rowText(row);
    if (text === "") {
      counts.header += 1; // blank structural row
      continue;
    }
    if (SUMMARY_ROW.test(text)) {
      counts.summary += 1; // footer / totals block, kept out of data counts
      continue;
    }
    if (
      (row[0] ?? "") === "Time" &&
      ((row[2] ?? "") === "Name" || (row[2] ?? "") === "Event Item")
    ) {
      counts.header += 1; // timeline / menu table column headings
      continue;
    }
    const filled = row.filter((cell) => cell.length > 0);
    if (filled.length === 1 && !filled[0].endsWith(":")) {
      counts.header += 1; // title or section heading (a lone label cell)
      continue;
    }
    const label = filled.find((cell) => cell.endsWith(":"));
    if (label !== undefined) {
      const value = text.slice(text.indexOf(label) + label.length).trim();
      if (value.length > 0) counts.normalized += 1;
      else counts.needs_mapping += 1; // recognized label, missing value
      continue;
    }
    // Content the label/value walk cannot account for yet (timeline rows,
    // menu tables) — visible as mapping work, not silently skipped.
    counts.needs_mapping += 1;
  }

  const rowOutcomeCounts: Partial<Record<WorkbookRowOutcome, number>> = {};
  for (const [outcome, count] of Object.entries(counts) as Array<
    [WorkbookRowOutcome, number]
  >) {
    if (count > 0) rowOutcomeCounts[outcome] = count;
  }

  return {
    disposition: counts.needs_mapping > 0 ? "needs_mapping" : "normalized",
    parseStatus: "parsed",
    totalRowCount: rows.length,
    rowOutcomeCounts,
  };
}
