import { PDFDocument, rgb } from "pdf-lib";
import { printableText } from "../printableText";
import { answerFonts, layoutAnswerPages, PAGE_LAYOUT } from "./answersPage";
import type { FinalLockPrintLine } from "./evaluate";

/**
 * The server stamps the Final Lock answer pages into every printed packet,
 * from the answers it checked, so the PDF shows exactly the answers the
 * revision stores, whatever file the browser sent.
 */
export async function appendFinalLockPages(
  bytes: Uint8Array,
  print: { lines: FinalLockPrintLine[] },
  identity: { invoiceNumber: string; eventDate: string },
): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes);
  } catch {
    throw new Error("Expected a PDF file");
  }
  const { font, bold } = await answerFonts(doc);
  const pages = layoutAnswerPages(font, bold, print.lines);
  const total = doc.getPageCount() + pages.length;
  const { left, top: firstRow, size } = PAGE_LAYOUT;
  const ink = rgb(0.13, 0.17, 0.2);
  const rust = rgb(0.57, 0.21, 0.07);
  const grey = rgb(0.63, 0.66, 0.69);
  const top = size[1];
  pages.forEach((rows, index) => {
    const page = doc.addPage(size);
    page.drawText(
      printableText(
        `EVENT ${identity.invoiceNumber}  /  ${identity.eventDate}  /  FINAL LOCK ANSWERS`,
      ),
      { x: left, y: top - 32 - 8 * 0.82, size: 8, font: bold, color: ink },
    );
    page.drawLine({
      start: { x: left, y: top - 48 },
      end: { x: 572, y: top - 48 },
      color: rgb(0.78, 0.82, 0.84),
    });
    let y = firstRow;
    if (index > 0) {
      page.drawText("CONTINUED", {
        x: left,
        y: top - y - 8 * 0.82,
        size: 8,
        font: bold,
        color: ink,
      });
      y += 17;
    }
    for (const row of rows) {
      page.drawText(row.text, {
        x: left,
        y: top - y - row.size * 0.82,
        size: row.size,
        font: row.bold ? bold : font,
        color: row.issue ? rust : ink,
      });
      y += row.size * 1.3 + row.gapAfter;
    }
    page.drawText(
      `Final Lock answers | Page ${total - pages.length + index + 1} / ${total}`,
      { x: left, y: 33.4, size: 8, font, color: grey },
    );
  });
  return doc.save();
}
