import { describe, expect, it } from "vitest";

import { loadEventBundle } from "../src/lib/tppReports/loadEventBundle";
import { readPdfTextLines } from "../src/lib/tppReports/pdfTextReaderNode";

/**
 * A TPP Banquet Event Order printed to PDF (ActiveReports, as in
 * work/Donnely/report.pdf): every table cell is one whole text run, the
 * header is a two-column table, and the page objects are stored out of
 * printed order. The event import must read it as a BEO, not as the
 * battle board.
 */
type Run = [x: number, y: number, text: string];

function content(runs: Run[]): string {
  return runs
    .map(
      ([x, y, text]) =>
        `BT /F1 1 Tf 9 0 0 9 ${x} ${y} Tm (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`,
    )
    .join("\n");
}

function buildPdf(pages: Run[][]): Buffer {
  // Page objects are written last page first; /Kids gives the real order.
  const objects: string[] = [];
  const pageNumbers = pages.map((_, index) => 10 + (pages.length - index) * 2);
  objects.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objects.push(
    `2 0 obj << /Type /Pages /Kids [${pageNumbers.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages.length} >> endobj`,
  );
  objects.push(
    "3 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  );
  for (let index = pages.length - 1; index >= 0; index -= 1) {
    const page = pageNumbers[index]!;
    const stream = content(pages[index]!);
    objects.push(
      `${page} 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R >> >> /Contents ${page + 1} 0 R >> endobj`,
    );
    objects.push(
      `${page + 1} 0 obj << /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`,
    );
  }
  return Buffer.from(`%PDF-1.4\n${objects.join("\n")}\n%%EOF\n`, "latin1");
}

const PAGE_ONE: Run[] = [
  [25, 726, "Banquet Event Order"],
  [25, 701, "Invoice #:"],
  [111, 701, "7001"],
  [312, 701, "Date:"],
  [379, 701, "Saturday 10/10/2026"],
  [25, 683, "Event Title:"],
  [111, 683, "Harvest Wedding"],
  [312, 683, "Event Time:"],
  [379, 683, "3:30 PM - 10:00 PM"],
  [25, 665, "Occasion:"],
  [111, 665, "**Wedding"],
  [312, 665, "Guest Count:"],
  [379, 665, "65"],
  [25, 647, "Service Style:"],
  [111, 647, "Buffet - Cook Onsite"],
  [312, 647, "Location:"],
  [379, 647, "Orchard Barn"],
  [379, 637, "100 Orchard Road"],
  [25, 629, "Event Type:"],
  [111, 629, "Wedding"],
  [379, 626, "Spokane WA, 99223"],
  [379, 606, "Venue Contact: Sam"],
  [379, 595, "Contact Phone #: (509) 555-0100"],
  [25, 572, "Contact:"],
  [111, 572, "Pat Example"],
  [111, 561, "Home: (509) 555-0199"],
  [25, 490, "Setup Notes"],
  [56, 472, "Event Overview"],
  [56, 457, "A buffet with apps, then dinner."],
];

const PAGE_TWO: Run[] = [
  [28, 774, "Time"],
  [107, 774, "Qty"],
  [184, 774, "Event Item"],
  [28, 758, "-"],
  [107, 758, "49 Serving"],
  [184, 758, "Grilled Tri Tip Steak"],
  [184, 746, "Sirloin tri tip, rubbed with spices and"],
  [184, 738, "marinated in garlic."],
  [56, 600, "Staffing"],
  [56, 585, "Venue Manager - Sam Host (509) 555-0100"],
];

const pdf = buildPdf([PAGE_ONE, PAGE_TWO]);

describe("TPP BEO printed to PDF", () => {
  it("reads pages in printed order and keeps each table cell apart", () => {
    const lines = readPdfTextLines(pdf);
    expect(lines[0]?.text).toBe("Banquet Event Order");
    expect(lines[1]?.cells.map((cell) => cell.text)).toEqual([
      "Invoice #:",
      "7001",
      "Date:",
      "Saturday 10/10/2026",
    ]);
    expect(lines.at(-1)?.text).toBe("Venue Manager - Sam Host (509) 555-0100");
  });

  it("is imported as the BEO with its header, venue, client and menu", () => {
    const { bundle, recognized } = loadEventBundle([
      { name: "report.pdf", contents: pdf },
    ]);
    expect(recognized).toEqual([{ name: "report.pdf", source: "beo" }]);
    expect(bundle.header).toMatchObject({
      invoiceNumber: "7001",
      title: "Harvest Wedding",
      eventDate: "2026-10-10",
      startMinutes: 15 * 60 + 30,
      endMinutes: 22 * 60,
      guestCount: 65,
      serviceStyle: "Buffet - Cook Onsite",
    });
    expect(bundle.venue).toMatchObject({
      name: "Orchard Barn",
      addressLine1: "100 Orchard Road",
      city: "Spokane",
      postalCode: "99223",
    });
    // The client's own phone, not the venue contact's printed beside it.
    expect(bundle.client).toMatchObject({
      name: "Pat Example",
      phone: "5095550199",
    });
    expect(bundle.menu[0]).toMatchObject({
      name: "Grilled Tri Tip Steak",
      quantityServings: 49,
      description:
        "Sirloin tri tip, rubbed with spices and marinated in garlic.",
    });
    expect(bundle.notes.eventOverview).toContain("A buffet with apps");
    // The venue manager under Staffing is a contact, not crew.
    expect(bundle.otherContacts).toEqual([
      { role: "Venue Manager", name: "Sam Host", phone: "5095550100" },
    ]);
    expect(bundle.staff).toEqual([]);
  });
});
