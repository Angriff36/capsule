import type { PdfTextLine } from "./pdfTextReader";

const BEO_TITLE = /^banquet event order$/i;
/** The right-hand label column of the BEO header table starts with "Date:". */
const RIGHT_COLUMN_LABEL = /^date:$/i;
const HEADER_END = /^setup notes$/i;

/** True when the PDF is a TPP Banquet Event Order print. */
export function isBeoPdf(lines: readonly PdfTextLine[]): boolean {
  return lines.some((line) => BEO_TITLE.test(line.text));
}

/**
 * The BEO PDF as the text `parseBeoText` reads. The header is a two-column
 * table, so a PDF line mixes both columns ("Event Type: Wedding" sits between
 * the venue street and city). Each column of the header is written out on its
 * own, left then right, so the venue address block stays together under
 * "Location:" and "Contact:" comes before "Contact Phone #:".
 */
export function beoPdfText(lines: readonly PdfTextLine[]): string {
  const start = lines.findIndex((line) => BEO_TITLE.test(line.text));
  const end = lines.findIndex(
    (line, index) => index > start && HEADER_END.test(line.text),
  );
  const headerEnd = end < 0 ? start : end;
  const divider = lines
    .slice(start, headerEnd)
    .flatMap((line) => line.cells)
    .find((cell) => RIGHT_COLUMN_LABEL.test(cell.text))?.x;
  if (start < 0 || divider === undefined) {
    return lines.map((line) => line.text).join("\n");
  }

  const left: string[] = [];
  const right: string[] = [];
  for (const line of lines.slice(start, headerEnd)) {
    const put = (target: string[], before: boolean) => {
      const text = line.cells
        .filter((cell) => cell.x < divider - 1 === before)
        .map((cell) => cell.text)
        .join(" ");
      if (text.length > 0) target.push(text);
    };
    put(left, true);
    put(right, false);
  }
  return [
    ...lines.slice(0, start).map((line) => line.text),
    ...left,
    ...right,
    ...joinWrappedLines(lines.slice(headerEnd)),
  ].join("\n");
}

/**
 * A dish description wraps onto lines set closer together than the rows of
 * the item table ("rubbed with spices and" / "marinated in garlic."). Join
 * them so the whole description reads as one line under its dish.
 */
function joinWrappedLines(lines: readonly PdfTextLine[]): string[] {
  const out: string[] = [];
  let previous: PdfTextLine | undefined;
  for (const line of lines) {
    const wrapped =
      previous !== undefined &&
      previous.page === line.page &&
      previous.cells.length === 1 &&
      line.cells.length === 1 &&
      Math.abs(previous.cells[0]!.x - line.cells[0]!.x) < 1 &&
      previous.y - line.y > 0 &&
      previous.y - line.y <= 10;
    if (wrapped) out[out.length - 1] += ` ${line.text}`;
    else out.push(line.text);
    previous = line;
  }
  return out;
}
