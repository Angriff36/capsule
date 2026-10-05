import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { appendAttachedFiles } from "../src/lib/eventPacket/appendAttachedFiles";

/** A 1 x 1 PNG. */
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

async function pdfWithPages(count: number) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage();
  return doc.save();
}

describe("attached files at the back of the event packet", () => {
  it("adds every page of a PDF, one page per picture, and a named page for a file it cannot read", async () => {
    const merged = await PDFDocument.create();
    merged.addPage();
    const font = await merged.embedFont(StandardFonts.Helvetica);
    await appendAttachedFiles(
      merged,
      [
        {
          name: "BEO 6014.pdf",
          contentType: "application/pdf",
          bytes: await pdfWithPages(3),
        },
        { name: "Floor plan.png", contentType: "image/png", bytes: PNG },
        {
          name: "Broken map.jpg",
          contentType: "image/jpeg",
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      font,
    );
    // 1 workbook page + 3 BEO pages + 1 floor plan + 1 "could not print".
    expect(merged.getPageCount()).toBe(6);
    // The saved packet opens again.
    const reopened = await PDFDocument.load(await merged.save());
    expect(reopened.getPageCount()).toBe(6);
  });

  it("adds nothing when the event has no drawings or papers", async () => {
    const merged = await PDFDocument.create();
    merged.addPage();
    const font = await merged.embedFont(StandardFonts.Helvetica);
    await appendAttachedFiles(merged, [], font);
    expect(merged.getPageCount()).toBe(1);
  });
});
