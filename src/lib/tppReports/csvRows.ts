/**
 * RFC 4180 CSV reader for TPP report exports.
 *
 * The reports are not tabular: banner rows, section headers and merged cells
 * share one file. So this returns raw rows and leaves meaning to each parser.
 */

export interface CsvReadOptions {
  /**
   * Keep one leading space on cells that were indented in the file.
   *
   * TPP marks section headings by indentation alone, so the pack-list parser
   * needs the marker. Other parsers do not and get plain trimmed cells.
   */
  keepIndentMarker?: boolean;
}

/** Split CSV text into rows of cells. Quoted cells may span lines. */
export function readCsvRows(
  text: string,
  options: CsvReadOptions = {},
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endCell = () => {
    const collapsed = cell.replace(/\s+/g, " ").trim();
    const indented = options.keepIndentMarker === true && /^[ \t]/.test(cell);
    row.push(indented && collapsed.length > 0 ? ` ${collapsed}` : collapsed);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };

  const source = text.replace(/^﻿/, "");
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]!;

    if (quoted) {
      // TPP escapes an inner quote with a backslash instead of doubling it.
      if (char === "\\" && source[index + 1] === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      endCell();
    } else if (char === "\r") {
      if (source[index + 1] === "\n") index += 1;
      endRow();
    } else if (char === "\n") {
      endRow();
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) endRow();

  return rows;
}

/** True when every cell of the row is empty. */
export function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.length === 0);
}

/**
 * Value that follows a label cell, searching the row left to right.
 * TPP pads labels with empty merge cells, so the next non-empty cell wins.
 */
export function valueAfterLabel(
  row: readonly string[],
  label: string,
): string | undefined {
  const wanted = label.toLowerCase().replace(/[\s:]+$/, "");
  for (let index = 0; index < row.length; index += 1) {
    const cell = row[index]!.toLowerCase().replace(/[\s:]+$/, "");
    if (cell !== wanted) continue;
    for (let next = index + 1; next < row.length; next += 1) {
      const value = row[next]!;
      if (value.length > 0) return value;
    }
  }
  return undefined;
}

/** Scan a whole report for the first value that follows a label. */
export function findLabelledValue(
  rows: readonly (readonly string[])[],
  label: string,
): string | undefined {
  for (const row of rows) {
    const value = valueAfterLabel(row, label);
    if (value !== undefined) return value;
  }
  return undefined;
}
