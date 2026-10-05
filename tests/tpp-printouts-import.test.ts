import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadEventBundle } from "../src/lib/tppReports/loadEventBundle";
import { loadEventBundleFromText } from "../src/lib/tppReports/loadEventBundleFromText";
import { readPdfTextLinesInBrowser } from "../src/lib/tppReports/pdfTextReaderBrowser";
import { readPdfTextLines } from "../src/lib/tppReports/pdfTextReaderNode";

/**
 * The rest of the Ewing Wedding (invoice 5935) printouts in work/Ewing: the
 * pack list printed to PDF in both groupings, the client's event menu
 * printed to PDF, and the BEO saved as Rich Text. Each must be read as its
 * own report, not as the battle board (or not at all).
 */
function load(...names: string[]) {
  return loadEventBundle(
    names.map((name) => ({
      name,
      contents: readFileSync(
        new URL(`./fixtures/tpp-reports/${name}`, import.meta.url),
      ),
    })),
  );
}

const header = {
  invoiceNumber: "5935",
  title: "Ewing Wedding",
  eventDate: "2026-09-26",
  guestCount: 30,
  serviceStyle: "Buffet - Cook Onsite",
};

describe("TPP printouts read by the event import", () => {
  it("reads the pack list PDF grouped by classification", () => {
    const { bundle, recognized } = load("pack-list.pdf");
    expect(recognized).toEqual([{ name: "pack-list.pdf", source: "packList" }]);
    expect(bundle.header).toMatchObject({ ...header, status: "2- Sales Lock" });
    expect(bundle.packList).toHaveLength(138);
    const line = (name: string) =>
      bundle.packList.find((item) => item.name === name);
    expect(line("5' Big John Grill")).toEqual({
      classification: "(DAY OF) Equipment",
      name: "5' Big John Grill",
      quantity: 1,
      unit: "Each",
      code: "FK0",
      forItems: ["This Event Only"],
    });
    // A note stays on the item it was written under, in its own column.
    expect(line("Propane Tank (5 gallon)")?.notes).toBe("ovens");
    expect(line("Propane Tank (8 gallon)")?.notes).toBe("big john grill");
    // Wrapped headings, names and "For:" lists are read whole.
    expect(line("Serving Tongs - Standard")).toMatchObject({
      classification: "GREEN: FOH - To Buffet (Utensils)",
      forItems: [
        "Beef Tenderloin",
        "Fresh Grilled Corn on the Cob",
        "Grilled Huckleberry BBQ Airline Chicken Breast",
      ],
    });
    expect(
      line("Plasticware - Black Plastic Fork, Knife, Napkin Rolled"),
    ).toMatchObject({ quantity: 33, code: "A07" });
    expect(line("Beef Tenderloin")).toMatchObject({
      classification: "Cambro",
      quantity: 6.5,
      unit: "Pound",
    });
    expect(line("Thyme - Fresh")?.classification).toBe("Dry Goods");
  });

  it("reads the pack list PDF grouped by menu item", () => {
    const { bundle } = load("pack-list-by-menu-item.pdf");
    expect(bundle.header).toMatchObject(header);
    expect(bundle.packList).toHaveLength(168);
    expect(
      bundle.packList.filter(
        (item) =>
          item.classification === "Fresh Baked Dinner Rolls with Honey Butter",
      ),
    ).toHaveLength(7);
    expect(
      bundle.packList.find((item) => item.name === "Butter Knife"),
    ).toMatchObject({
      forItems: ["Fresh Baked Dinner Rolls with Honey Butter"],
      notes: "standard",
    });
    expect(
      bundle.packList.find((item) => item.name === "Battery Powered Lights"),
    ).toMatchObject({
      classification: "This Event Only",
      notes: "2 light kits",
    });
  });

  it("reads the event menu PDF with courses, notes and descriptions", () => {
    const { bundle, recognized } = load("event-menu.pdf");
    expect(recognized).toEqual([
      { name: "event-menu.pdf", source: "eventMenu" },
    ]);
    expect(bundle.header.eventDate).toBe("2026-09-26");
    expect(bundle.client.name).toBe("Kamini Singh");
    expect(bundle.notes.dietary).toBe("No Olive Oil");
    expect(bundle.menu).toHaveLength(15);
    expect(bundle.menu[0]).toMatchObject({
      name: "Charcuterie Display",
      course: "Pre Ceremony Cocktail Hour",
    });
    expect(bundle.menu[0]?.specialInstructions).toContain(
      "they can not be touching due to dietary restrictions",
    );
    expect(bundle.menu[0]?.description).toMatch(
      /^Marinated mozzarella.*extra virgin olive oill\.$/,
    );
    expect(
      bundle.menu.find(
        (item) =>
          item.name === "Grilled Huckleberry BBQ Airline Chicken Breast",
      ),
    ).toEqual({
      name: "Grilled Huckleberry BBQ Airline Chicken Breast",
      course: "Reception",
      description: "Brushed with a huckleberry BBQ sauce.",
    });
    expect(bundle.menu.at(-1)).toEqual({
      name: "Sweet Tea",
      course: "Beverages",
      specialInstructions: "Set out for pre ceremony hour",
    });
  });

  it("reads the BEO saved as Rich Text like the BEO PDF", () => {
    const rtf = load("beo.rtf");
    const pdf = load("beo.pdf");
    expect(rtf.recognized).toEqual([{ name: "beo.rtf", source: "beo" }]);
    expect(rtf.bundle.header).toEqual(pdf.bundle.header);
    expect(rtf.bundle.client).toEqual(pdf.bundle.client);
    expect(rtf.bundle.venue).toEqual(pdf.bundle.venue);
    expect(rtf.bundle.timeline.map((entry) => entry.minutes)).toEqual(
      pdf.bundle.timeline.map((entry) => entry.minutes),
    );
    // The saved file keeps the team column apart, as the worksheet does.
    expect(rtf.bundle.timeline[2]).toEqual({
      name: "Arrive Onsite",
      minutes: 12 * 60,
      notes: "BOH",
    });
    expect(rtf.bundle.menu.map((item) => item.quantityServings)).toEqual(
      pdf.bundle.menu.map((item) => item.quantityServings),
    );
    // Wrapped descriptions are joined, as in the PDF.
    expect(
      rtf.bundle.menu.find((item) => item.name === "Peppercorn Cream Sauce")
        ?.description,
    ).toBe(
      "Cream sauce finished with brandy, shallots and green peppercorns. Great addition to any of our beef entrees!",
    );
    expect(rtf.bundle.notes.dietary).toContain("NO OLIVE OIL");
    // The PDF's Windows long dash reads as a dash, not a box.
    expect(pdf.bundle.notes.dietary).toContain("anything — bride");
  });

  it("joins every printout of one event into one bundle", () => {
    const { bundle } = load(
      "beo.rtf",
      "event-menu.pdf",
      "pack-list.pdf",
      "event-worksheet.pdf",
    );
    expect(bundle.menu).toHaveLength(15);
    expect(bundle.packList.length).toBeGreaterThan(138);
    expect(bundle.warnings).not.toContainEqual(
      expect.stringContaining("not recognized"),
    );
  });
});

describe("TPP printouts on the event import page", () => {
  const pdfs = [
    "pack-list.pdf",
    "pack-list-by-menu-item.pdf",
    "event-menu.pdf",
    "event-worksheet.pdf",
    "beo.pdf",
  ];
  const bytes = (name: string) =>
    new Uint8Array(
      readFileSync(new URL(`./fixtures/tpp-reports/${name}`, import.meta.url)),
    );

  it("reads each PDF in the page exactly as the agent path does", async () => {
    for (const name of pdfs) {
      expect(await readPdfTextLinesInBrowser(bytes(name))).toEqual(
        readPdfTextLines(bytes(name)),
      );
    }
  });

  it("builds the same bundle from PDFs read in the page", async () => {
    const csvFiles = await Promise.all(
      pdfs.map(async (name) => ({
        name,
        text: "",
        pdfLines: await readPdfTextLinesInBrowser(bytes(name)),
      })),
    );
    const page = loadEventBundleFromText({ csvFiles });
    expect(page.recognized.map((entry) => entry.source)).toEqual([
      "packList",
      "packList",
      "eventMenu",
      "eventWorksheet",
      "beo",
    ]);
    expect(page.bundle).toEqual(load(...pdfs).bundle);
  });

  it("names a PDF that is no TPP report instead of reading nothing", () => {
    const page = loadEventBundleFromText({
      csvFiles: [{ name: "contract.pdf", text: "", pdfLines: [] }],
    });
    expect(page.unrecognized).toEqual(["contract.pdf"]);
  });
});
