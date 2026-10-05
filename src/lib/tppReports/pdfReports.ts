import type { EventBundlePart } from "./eventBundle";
import { beoPdfText, isBeoPdf } from "./beoPdfText";
import { isEventMenuPdf, parseEventMenuPdf } from "./eventMenuPdf";
import { isPackListPdf, parsePackListPdf } from "./packListPdf";
import { parseBattleBoard } from "./parseBattleBoard";
import { parseBeoText } from "./parseBeoText";
import { parseEventWorksheet } from "./parseEventWorksheet";
import type { PdfTextLine } from "./pdfTextReader";
import { isEventWorksheetPdf, worksheetPdfRows } from "./worksheetPdfRows";

/**
 * One TPP report printed to PDF, recognized by its content: the BEO, the
 * event worksheet, the pack list or the client's event menu. Any other PDF
 * is read as the battle board; one that gives nothing is no TPP report.
 * Shared by the agent path and the event import page.
 */
export function bundlePartFromPdfLines(
  lines: readonly PdfTextLine[],
): EventBundlePart | undefined {
  if (isBeoPdf(lines)) return parseBeoText(beoPdfText(lines));
  if (isEventWorksheetPdf(lines))
    return parseEventWorksheet(worksheetPdfRows(lines));
  if (isPackListPdf(lines)) return parsePackListPdf(lines);
  if (isEventMenuPdf(lines)) return parseEventMenuPdf(lines);
  const board = parseBattleBoard(lines);
  const found =
    (board.timeline?.length ?? 0) +
    (board.menu?.length ?? 0) +
    (board.staff?.length ?? 0);
  return found > 0 || board.header?.invoiceNumber ? board : undefined;
}
