import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadEventBundle } from "../src/lib/tppReports/loadEventBundle";

/**
 * The TPP Event Worksheet printed to PDF (work/Ewing/EventWorksheet.pdf,
 * invoice 5935). The event import must read it as the event worksheet, not
 * as the battle board, and give the same parts the workbook export gives.
 */
const pdf = readFileSync(
  new URL("./fixtures/tpp-reports/event-worksheet.pdf", import.meta.url),
);
const { bundle, recognized } = loadEventBundle([
  { name: "EventWorksheet.pdf", contents: pdf },
]);

describe("TPP Event Worksheet printed to PDF", () => {
  it("is imported as the event worksheet with its header and client", () => {
    expect(recognized).toEqual([
      { name: "EventWorksheet.pdf", source: "eventWorksheet" },
    ]);
    expect(bundle.header).toMatchObject({
      invoiceNumber: "5935",
      title: "Ewing Wedding",
      eventDate: "2026-09-26",
      startMinutes: 15 * 60,
      endMinutes: 19 * 60,
      guestCount: 30,
      serviceStyle: "Buffet - Cook Onsite",
      status: "2- Sales Lock",
      salespersonName: "Joshua Mitchell",
    });
    expect(bundle.client).toMatchObject({
      name: "Kamini Singh",
      phone: "4068398458",
      city: "Troutdale",
      postalCode: "97060",
    });
    expect(bundle.venue).toMatchObject({
      name: "Singh Campsite",
      latitude: 47.01359,
      longitude: -116.52979,
    });
  });

  it("reads the timeline", () => {
    expect(bundle.timeline).toHaveLength(17);
    expect(bundle.timeline[2]).toEqual({
      name: "Arrive Onsite",
      minutes: 12 * 60,
      notes: "BOH",
    });
  });

  it("reads every dish with its notes, servings, course and description", () => {
    expect(bundle.menu.map((item) => item.name)).toHaveLength(15);
    expect(bundle.menu[0]).toMatchObject({
      name: "Charcuterie Display",
      quantityServings: 30,
      course: "Pre Ceremony Cocktail Hour",
    });
    expect(bundle.menu[0]?.specialInstructions).toContain("NO ONIONS");
    expect(
      bundle.menu.find((item) => item.name === "Beef Tenderloin"),
    ).toMatchObject({ quantityServings: 13, course: "Reception" });
    // Gear and crew rows after the food are never dishes.
    expect(bundle.menu.map((item) => item.name)).not.toContain("Field Kitchen");
    expect(bundle.menu.at(-1)?.name).toBe("Sweet Tea");
  });

  it("reads the gear, the crew shifts and the setup notes", () => {
    expect(bundle.packList.map((line) => [line.name, line.quantity])).toEqual([
      ["Field Kitchen", 1],
      ["Blue Ribbon Rental - Floor mats 4x6", 13],
      ["Event Rents", 1],
    ]);
    expect(bundle.staff).toEqual([
      expect.objectContaining({
        role: "Catering - FOH Captain",
        startMinutes: 16 * 60 + 15,
        endMinutes: 20 * 60,
      }),
      expect.objectContaining({ role: "Catering - BOH LEAD" }),
      expect.objectContaining({
        role: "Catering - BOH",
        startMinutes: 17 * 60,
        endMinutes: 21 * 60,
      }),
      expect.objectContaining({ role: "Catering - FOH" }),
    ]);
    expect(bundle.notes.eventOverview).toContain("family campsite");
    expect(bundle.notes.menuNotes).toContain("NO OLIVE OIL");
    expect(bundle.notes.operationsNotes).toContain("LIMITED CELL SERVICE");
    expect(bundle.notes.additionalTasks).toContain("Box up leftovers");
  });
});
