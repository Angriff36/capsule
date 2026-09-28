import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { printableText } from "../printableText";
import type { FinalLockPrintLine } from "./evaluate";

/**
 * Where the Final Lock answer pages put each row. The browser counts these
 * pages for its page numbers; the server draws them (pdfStamp.ts).
 */
export const PAGE_LAYOUT = {
  left: 40,
  width: 532,
  top: 66,
  bottom: 742,
  size: [612, 792] as [number, number],
};

export interface AnswerRow {
  text: string;
  size: number;
  bold: boolean;
  issue: boolean;
  gapAfter: number;
}

function wrap(font: PDFFont, text: string, size: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/ +/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > PAGE_LAYOUT.width) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line || " ");
  }
  return out;
}

/** Rows per page, the same for the browser's count and the server's draw. */
export function layoutAnswerPages(
  font: PDFFont,
  bold: PDFFont,
  lines: FinalLockPrintLine[],
): AnswerRow[][] {
  const pages: AnswerRow[][] = [[]];
  let y = PAGE_LAYOUT.top;
  const add = (row: Omit<AnswerRow, "gapAfter">, gapAfter: number) => {
    if (y + row.size * 1.3 > PAGE_LAYOUT.bottom) {
      pages.push([]);
      y = PAGE_LAYOUT.top + 17;
    }
    pages.at(-1)!.push({ ...row, gapAfter });
    y += row.size * 1.3 + gapAfter;
  };
  for (const text of wrap(bold, "Final Lock answers", 16))
    add({ text, size: 16, bold: true, issue: false }, 6);
  for (const line of lines) {
    const issue = line.result === "unresolved";
    const size = issue ? 8.4 : 10;
    // Stored lines are already printable; this changes nothing for them.
    const rows = wrap(font, printableText(`${line.label}: ${line.text}`), size);
    rows.forEach((text, i) =>
      add(
        { text, size, bold: false, issue },
        i === rows.length - 1 ? (issue ? 4 : 6) : 0,
      ),
    );
  }
  return pages;
}

export async function answerFonts(doc: PDFDocument) {
  return {
    font: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

/** How many pages the server will add for these answers. */
export async function finalLockPageCount(
  lines: FinalLockPrintLine[],
): Promise<number> {
  const { font, bold } = await answerFonts(await PDFDocument.create());
  return layoutAnswerPages(font, bold, lines).length;
}
