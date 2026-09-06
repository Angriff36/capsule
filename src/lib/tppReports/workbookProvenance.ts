import { readXlsxWorkbook, type XlsxTypedCell } from "./xlsxReader";
import { XLSX_PARSER_VERSION } from "./xlsxValues";

/**
 * Workbook provenance for the import archive (PR01-03): the evidence record
 * an operator inspects from the import run. Coordinates, raw stored text,
 * interpreted value, date system and parser version ride one JSON document
 * persisted on ImportArtifact.provenance — the raw evidence sits next to its
 * interpretation and never replaces it. A source artifact is evidence, not
 * proof of normalized data.
 */

/** Recorded cells per workbook — bigger workbooks keep counts, lose detail. */
export const PROVENANCE_CELL_CAP = 2000;

/**
 * Serialized-size budget for the whole provenance document. Convex caps a
 * document at 1 MiB and a single legal cell can hold tens of thousands of
 * characters, so a cell-count cap alone cannot bound the persisted JSON.
 * Truncation is always marked, never silent.
 */
export const PROVENANCE_BYTE_BUDGET = 256 * 1024;

/** Longest single string kept per cell field (raw/value/formula). */
const PROVENANCE_VALUE_CHARS = 2048;

/**
 * Recorded merged ranges per sheet. Merges are metadata, not evidence rows,
 * but a pathological sheet can carry tens of thousands of mergeCell
 * entries — they share the byte budget and stop at this count cap.
 */
const PROVENANCE_RANGE_CAP = 256;

export interface ProvenanceCell {
  ref: string;
  raw: string;
  outcome: string;
  value?: string | number | boolean;
  unit: string | null;
  formula?: string;
  sharedFormulaSi?: number;
  dateSystem?: string;
  mergedRange?: string;
  truncated?: boolean;
}

export interface ProvenanceSheet {
  name: string;
  mergedRanges: string[];
  cells: ProvenanceCell[];
}

export interface WorkbookProvenance {
  parserVersion: string;
  dateSystem: string;
  timezone: string;
  timezoneAssumption: string;
  macros: string;
  sheetCount: number;
  cellCount: number;
  cellCap: number;
  byteBudget: number;
  cellsTruncated: boolean;
  /** Merge ranges were dropped (count cap or byte budget). */
  mergedRangesTruncated: boolean;
  sheets: ProvenanceSheet[];
}

/** Cap one string at the per-field length, marking the cut in the record. */
function truncateText(text: string): { text: string; truncated: boolean } {
  if (text.length <= PROVENANCE_VALUE_CHARS) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, PROVENANCE_VALUE_CHARS)}…[truncated]`,
    truncated: true,
  };
}

/** Cell evidence for persistence; undefined optional fields drop in JSON. */
function provenanceCell(cell: XlsxTypedCell): ProvenanceCell {
  const raw = truncateText(cell.raw);
  // unit comes from the cell's own numFmt literal — adversarially long
  // format codes must not ride through unbounded (review round 3).
  const unit =
    cell.unit !== null && cell.unit.length > PROVENANCE_VALUE_CHARS
      ? truncateText(cell.unit)
      : null;
  const record: ProvenanceCell = {
    ref: cell.ref,
    raw: raw.text,
    outcome: cell.outcome,
    unit: unit?.text ?? cell.unit,
  };
  if (raw.truncated || unit?.truncated) record.truncated = true;
  if (cell.value !== undefined) {
    // Typed values stay typed (dates as strings, numbers as numbers) —
    // only an over-long representation degrades to a marked string.
    const valueText = String(cell.value);
    if (valueText.length > PROVENANCE_VALUE_CHARS) {
      record.value = truncateText(valueText).text;
      record.truncated = true;
    } else {
      record.value = cell.value;
    }
  }
  if (cell.formula !== undefined) {
    const formula = truncateText(cell.formula);
    record.formula = formula.text;
    if (formula.truncated) record.truncated = true;
  }
  if (cell.sharedFormulaSi !== undefined) {
    record.sharedFormulaSi = cell.sharedFormulaSi;
  }
  if (cell.dateSystem !== undefined) record.dateSystem = cell.dateSystem;
  if (cell.mergedRange !== undefined) record.mergedRange = cell.mergedRange;
  return record;
}

/**
 * Build the persisted provenance document for one workbook. Throws when the
 * container is unreadable — the caller records that as a named error instead.
 */
export function buildWorkbookProvenance(buffer: Buffer): WorkbookProvenance {
  const workbook = readXlsxWorkbook(buffer);
  const cellCount = workbook.sheets.reduce(
    (sum, sheet) => sum + sheet.cells.length,
    0,
  );
  let remaining = PROVENANCE_CELL_CAP;
  let budget = PROVENANCE_BYTE_BUDGET;
  let taken = 0;
  let rangesTruncated = false;
  const sheets = workbook.sheets.map((sheet) => {
    // Merge ranges are charged to the same budget as cells (review round 2:
    // a merge-heavy sheet must not bypass the document bound). Each range is
    // checked against the REMAINING budget before it is taken (review round
    // 3): a single oversized ref must stop the loop, never overshoot.
    const mergedRanges: string[] = [];
    for (const range of sheet.mergedRanges) {
      const cost = range.length + 3;
      if (mergedRanges.length >= PROVENANCE_RANGE_CAP || budget < cost) {
        rangesTruncated = true;
        break;
      }
      mergedRanges.push(range);
      budget -= cost;
    }
    const cells: ProvenanceCell[] = [];
    for (const cell of sheet.cells) {
      if (remaining <= 0 || budget <= 0) break;
      const record = provenanceCell(cell);
      cells.push(record);
      remaining -= 1;
      taken += 1;
      budget -= JSON.stringify(record)?.length ?? 0;
    }
    return {
      name: sheet.name,
      mergedRanges,
      cells,
    };
  });
  return {
    parserVersion: workbook.parserVersion,
    dateSystem: workbook.dateSystem,
    timezone: workbook.timezone,
    timezoneAssumption: workbook.timezoneAssumption,
    macros: workbook.macros,
    sheetCount: workbook.sheets.length,
    cellCount,
    cellCap: PROVENANCE_CELL_CAP,
    byteBudget: PROVENANCE_BYTE_BUDGET,
    cellsTruncated: taken < cellCount,
    mergedRangesTruncated: rangesTruncated,
    sheets,
  };
}

/** Error provenance for an unreadable container — named, never silent. */
export function workbookErrorProvenance(error: unknown): {
  parserVersion: string;
  error: string;
} {
  return {
    parserVersion: XLSX_PARSER_VERSION,
    error: error instanceof Error ? error.message : String(error),
  };
}
