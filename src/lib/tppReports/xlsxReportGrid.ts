import type { XlsxSheet, XlsxTypedCell, XlsxTypedWorkbook } from "./xlsxReader";

/**
 * Renders a typed workbook as the string grid the report parsers read, in
 * the wording TPP prints: dates as M/D/YYYY, clock times as h:mm AM/PM, and
 * a number followed by the unit its own number format names. Nothing is
 * inferred — a cell without a format unit stays a bare number (issue #274).
 */
export class XlsxReportGrid {
  static fromWorkbook(workbook: XlsxTypedWorkbook): XlsxSheet[] {
    return workbook.sheets.map((sheet) => ({
      name: sheet.name,
      rows: XlsxReportGrid.rowsOf(sheet.cells),
    }));
  }

  /** Rows in sheet order; rows with no cell at all are dropped, as in the raw grid. */
  private static rowsOf(cells: readonly XlsxTypedCell[]): string[][] {
    const byRow = new Map<number, string[]>();
    for (const cell of cells) {
      const position = XlsxReportGrid.position(cell.ref);
      if (!position) continue;
      const row = byRow.get(position.row) ?? [];
      while (row.length < position.column) row.push("");
      row[position.column] = XlsxReportGrid.cellText(cell);
      byRow.set(position.row, row);
    }
    return [...byRow.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
  }

  static cellText(cell: XlsxTypedCell): string {
    const text = XlsxReportGrid.interpretedText(cell);
    return text.replace(/\s+/g, " ").trim();
  }

  private static interpretedText(cell: XlsxTypedCell): string {
    switch (cell.outcome) {
      case "merged_non_anchor":
      case "formula_without_cached_value":
      case "error_value":
        return "";
      case "date_1900":
      case "date_1904":
        return XlsxReportGrid.printedDate(String(cell.value ?? ""));
      case "time":
        return XlsxReportGrid.printedClock(String(cell.value ?? ""));
      case "fractional_day_time": {
        const [date, time] = String(cell.value ?? "").split("T");
        return `${XlsxReportGrid.printedDate(date ?? "")} ${XlsxReportGrid.printedClock(time ?? "")}`.trim();
      }
      default:
        if (typeof cell.value === "number") {
          const number = String(cell.value);
          return cell.unit ? `${number} ${cell.unit}` : number;
        }
        return typeof cell.value === "string" ? cell.value : cell.raw;
    }
  }

  /** "2026-09-12" → "9/12/2026". Anything else passes through. */
  private static printedDate(iso: string): string {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return iso;
    const [, year, month, day] = match;
    return `${Number(month)}/${Number(day)}/${year}`;
  }

  /** "17:30:00" → "5:30 PM". Elapsed times past 24h pass through. */
  private static printedClock(clock: string): string {
    const match = clock.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return clock;
    const hours = Number(match[1]);
    if (hours >= 24) return clock;
    const suffix = hours >= 12 ? "PM" : "AM";
    const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
    return `${twelveHour}:${match[2]} ${suffix}`;
  }

  /** "B7" → column 1, row 7. */
  private static position(
    ref: string,
  ): { row: number; column: number } | undefined {
    const match = ref.match(/^([A-Z]+)(\d+)$/i);
    if (!match) return undefined;
    let column = 0;
    for (const letter of match[1]!.toUpperCase()) {
      column = column * 26 + (letter.charCodeAt(0) - 64);
    }
    return { row: Number(match[2]), column: column - 1 };
  }
}
