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
  cellsTruncated: boolean;
  sheets: ProvenanceSheet[];
}

/** Cell evidence for persistence; undefined optional fields drop in JSON. */
function provenanceCell(cell: XlsxTypedCell): ProvenanceCell {
  const record: ProvenanceCell = {
    ref: cell.ref,
    raw: cell.raw,
    outcome: cell.outcome,
    unit: cell.unit,
  };
  if (cell.value !== undefined) record.value = cell.value;
  if (cell.formula !== undefined) record.formula = cell.formula;
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
  const sheets = workbook.sheets.map((sheet) => {
    const take = Math.min(sheet.cells.length, remaining);
    remaining -= take;
    return {
      name: sheet.name,
      mergedRanges: sheet.mergedRanges,
      cells: sheet.cells.slice(0, take).map(provenanceCell),
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
    cellsTruncated: cellCount > PROVENANCE_CELL_CAP,
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
