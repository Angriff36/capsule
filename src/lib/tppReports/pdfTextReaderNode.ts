import { inflateSync } from "node:zlib";

import { readPdfTextLinesWith, type PdfTextLine } from "./pdfTextReader";

/** Text lines of a PDF on the agent path (Node's zlib inflate). */
export function readPdfTextLines(buffer: Uint8Array): PdfTextLine[] {
  return readPdfTextLinesWith(buffer, (raw) => inflateSync(raw));
}
