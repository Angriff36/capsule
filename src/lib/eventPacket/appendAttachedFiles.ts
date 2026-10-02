import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import { printableText } from "./printableText";

/** A file kept on the event that prints at the back of the packet. */
export interface AttachedPrintFile {
  name: string;
  contentType: string;
  bytes: Uint8Array;
}

const LETTER: [number, number] = [612, 792];
const MARGIN = 40;
const TITLE_SPACE = 28;

function titled(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  font: PDFFont,
) {
  page.drawText(printableText(text).slice(0, 110), {
    x: MARGIN,
    y: LETTER[1] - MARGIN - 10,
    size: 10,
    font,
    color: rgb(0.13, 0.2, 0.28),
  });
}

/**
 * Spec §14.1 part 8 and §1.2 (Drive/Dropbox): setup drawings, maps and the
 * uploaded BEOs and worksheets print at the back of the packet, so nobody
 * hunts for them. A PDF adds all its pages as they are; a picture gets its
 * own page, scaled to fit, with its file name on top. A file that cannot be
 * read gets a page that names it and says where to open it.
 */
export async function appendAttachedFiles(
  merged: PDFDocument,
  files: readonly AttachedPrintFile[],
  font: PDFFont,
): Promise<void> {
  for (const file of files) {
    try {
      if (file.contentType === "application/pdf") {
        const source = await PDFDocument.load(file.bytes, {
          ignoreEncryption: true,
        });
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) merged.addPage(page);
        continue;
      }
      const image =
        file.contentType === "image/png"
          ? await merged.embedPng(file.bytes)
          : await merged.embedJpg(file.bytes);
      const page = merged.addPage(LETTER);
      titled(page, `Attached: ${file.name}`, font);
      const room = {
        width: LETTER[0] - MARGIN * 2,
        height: LETTER[1] - MARGIN * 2 - TITLE_SPACE,
      };
      const scale = Math.min(
        room.width / image.width,
        room.height / image.height,
        1,
      );
      page.drawImage(image, {
        x: MARGIN,
        y: MARGIN + room.height - image.height * scale,
        width: image.width * scale,
        height: image.height * scale,
      });
    } catch {
      const page = merged.addPage(LETTER);
      titled(
        page,
        `Attached: ${file.name} could not be printed here. Open it from the event's files.`,
        font,
      );
    }
  }
}
