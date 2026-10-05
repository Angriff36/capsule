import type { PdfTextLine } from "./pdfTextReader";

const WORKSHEET_TITLE = /^event worksheet$/i;
/** The centred section headings of the printed worksheet. */
const SECTIONS = new Set([
  "event notes",
  "timeline",
  "food",
  "rental / equipment",
  "miscellaneous event expenses",
  "setup",
  "event labor",
]);
const PRINTED_FOOTER = /^printed date:/i;
/** A wrapped line sits closer under its row than the next row does. */
const WRAP_GAP = 12.5;

/** True when the PDF is a TPP Event Worksheet print. */
export function isEventWorksheetPdf(lines: readonly PdfTextLine[]): boolean {
  return lines.some((line) => WORKSHEET_TITLE.test(line.text));
}

function sectionHeading(line: PdfTextLine): string | undefined {
  if (line.cells.length !== 1) return undefined;
  const text = line.text.trim();
  return SECTIONS.has(text.toLowerCase()) ? text : undefined;
}

/**
 * The Event Worksheet PDF as the rows `parseEventWorksheet` reads, laid out
 * like the workbook export of the same report: label and value side by side
 * in the header, one row per menu item with its notes and quantity in their
 * own columns, and the Setup prose one cell per printed page.
 */
export function worksheetPdfRows(lines: readonly PdfTextLine[]): string[][] {
  const firstSection = lines.findIndex((line) => sectionHeading(line));
  const headerEnd = firstSection < 0 ? lines.length : firstSection;
  const rows = headerRows(lines.slice(0, headerEnd));

  let section = "";
  let columns: number[] = [0];
  let setupPage: { page: number; row: string[] } | undefined;
  /** The last item row: wrapped names and notes continue it. */
  let item: { row: string[]; line: PdfTextLine } | undefined;
  let previous: { row: string[]; line: PdfTextLine } | undefined;

  for (const line of lines.slice(headerEnd)) {
    const heading = sectionHeading(line);
    if (heading) {
      section = heading.toLowerCase();
      columns = [0];
      item = undefined;
      previous = undefined;
      rows.push([heading]);
      continue;
    }
    if (PRINTED_FOOTER.test(line.text)) {
      rows.push(line.cells.map((cell) => cell.text.trim()));
      continue;
    }
    if (section === "setup") {
      // Setup prose prints as one cell per page in the workbook export.
      if (setupPage?.page !== line.page) {
        setupPage = { page: line.page, row: [""] };
        rows.push(setupPage.row);
      }
      setupPage.row[0] = `${setupPage.row[0]} ${line.text}`.trim();
      continue;
    }
    // The first line with three or more cells is the column header row; a
    // header that starts right of the margin has an unlabeled name column.
    if (columns.length === 1 && line.cells.length >= 3) {
      const starts = line.cells.map((cell) => cell.x);
      columns = starts[0]! > 60 ? [0, ...starts] : starts;
    }

    const row = toRow(line, columns);
    const filled = row.flatMap((cell, index) => (cell ? [index] : []));
    const single = line.cells.length === 1;
    if (section === "food" && single && item && filled[0] === 1) {
      // A note wrapped onto its own lines under the item.
      item.row[1] = `${item.row[1]} ${row[1]}`.trim();
      continue;
    }
    if (
      single &&
      previous &&
      previous.line.page === line.page &&
      previous.line.y - line.y <= WRAP_GAP &&
      Math.abs(previous.line.cells[0]!.x - line.cells[0]!.x) < 1
    ) {
      // A wrapped item name or description: the same column, set close.
      previous.row[0] = `${previous.row[0]} ${row[0]}`;
      previous = { row: previous.row, line };
      continue;
    }
    rows.push(row);
    previous = { row, line };
    if (filled.length > 1) item = previous;
  }
  return rows;
}

/** Each cell lands in the column whose header starts at or left of it. */
function toRow(line: PdfTextLine, columns: readonly number[]): string[] {
  const row = columns.map(() => "");
  for (const cell of line.cells) {
    let index = 0;
    while (index + 1 < columns.length && columns[index + 1]! <= cell.x + 8)
      index += 1;
    row[index] = `${row[index]} ${cell.text.trim()}`.trim();
  }
  return row;
}

/**
 * The header is two label columns side by side. A line with no label in a
 * column continues that column's last value ("Contact:" spans the name,
 * street, city and phone lines), so each label gets its whole value.
 */
function headerRows(lines: readonly PdfTextLine[]): string[][] {
  const divider = lines
    .flatMap((line) => line.cells)
    .find((cell) => /^(event date|event title|venue):$/i.test(cell.text))?.x;
  const pairs: string[][] = [];
  const last: Array<string[] | undefined> = [undefined, undefined];
  for (const line of lines) {
    const halves = [
      line.cells.filter((cell) => divider === undefined || cell.x < divider),
      line.cells.filter((cell) => divider !== undefined && cell.x >= divider),
    ];
    halves.forEach((cells, half) => {
      if (cells.length === 0) return;
      const texts = cells.map((cell) => cell.text.trim());
      if (/:$/.test(texts[0]!)) {
        const pair = [texts[0]!, texts.slice(1).join(" ")];
        pairs.push(pair);
        last[half] = pair;
      } else if (last[half]) {
        last[half][1] = `${last[half][1]} ${texts.join(" ")}`.trim();
      } else {
        pairs.push([texts.join(" ")]);
      }
    });
  }
  return pairs;
}
