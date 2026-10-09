import { describe, expect, it } from "vitest";

import { bundlePartFromPdfLines } from "../src/lib/tppReports/pdfReports";
import { parseEventWorksheet } from "../src/lib/tppReports/parseEventWorksheet";
import type { PdfTextLine } from "../src/lib/tppReports/pdfTextReader";

/**
 * A battle board printed from the browser ("Mangia Battle Board", the owner's
 * Supp wedding board 6184), laid out as its PDF text comes out: gaps inside
 * words and numbers, each label on its own line above its value, the team
 * printed under the row. Names and places here are made up.
 */
let y = 0;
function line(page: number, ...cells: Array<[number, string]>): PdfTextLine {
  y -= 20;
  return {
    page,
    y,
    text: cells.map(([, text]) => text).join(" "),
    cells: cells.map(([x, text]) => ({ x, text })),
  };
}

const BOARD: PdfTextLine[] = [
  line(0, [0, "EVENT"]),
  line(0, [31, "Lane Wedding"], [428, "6201"]),
  line(0, [21, "E V"], [37.6, "E N T DAT E"], [418, "GUE ST C O UN T"]),
  line(0, [31, "6/27 /20 26 - Saturday"], [428, "12 0 Final"]),
  line(
    0,
    [21, "ST AFF PARKI N G LO C AT I O N"],
    [418, "ST AFF RE ST RO O MS LO C AT I O N"],
  ),
  line(0, [31, "back lot"], [428, "barn restrooms"]),
  line(0, [0, "LAYOUT & LOCATIONS"]),
  line(0, [21, "SE RV"], [53.6, "I C E SE T UP / LAYO UT"]),
  line(0, [21, "Buffet along the east fence"]),
  line(0, [21, "O PE RAT I O N S N O T E S"]),
  line(0, [21, "Cooking in the barn bay"]),
  line(0, [0, "MANGIA'S RESPONSIBILITIES — AT A GLANCE"]),
  line(
    1,
    [21, "Bar service"],
    [307.7, "Y N — Cut cake / Serve dessert"],
    [710.7, "Y N —"],
  ),
  line(2, [0, "STAFF ROSTER"]),
  line(
    2,
    [25, "N AME"],
    [216.7, "RO LE"],
    [373.5, "T E AM"],
    [495.4, "SHI FT"],
    [671.6, "ST AT I O N"],
  ),
  line(
    2,
    [27, "Avery Pine"],
    [218.7, "Catering - BOH LEAD"],
    [497.4, "3 : 3 0 P M"],
    [563.4, "–11: 3 0 P M"],
    [673.6, "BOH"],
  ),
  line(2, [387.5, "BOH"]),
  line(2, [387.5, "LEAD"]),
  line(
    2,
    [27, "Jo Reed"],
    [218.7, "Catering - FOH"],
    [497.4, "6: 0 0 P M"],
    [563.4, "–10 : 0 0 P M"],
    [673.6, "FOH"],
  ),
  line(2, [387.5, "FOH"]),
  line(2, [0, "TIMELINE"]),
  line(4, [0, "SETUP & REFERENCE NOTES"]),
  line(4, [789.6, "▸"]),
  line(4, [17, "M"], [29, "enu / Culinary Notes"]),
  line(4, [17, "x2 GF pies"]),
  line(5, [789.6, "▸"]),
  line(5, [17, "Decor Collection / Linen Color"]),
  line(5, [17, "Rustic kit"]),
  line(5, [789.6, "▸"]),
  line(5, [17, "Catering Kitchen / Staging"]),
  line(5, [17, "P ark by the barn"]),
  line(5, [789.6, "▸"]),
  line(5, [17, "Additional Tasks / Responsibilities of M"], [262.5, "angia"]),
  line(5, [17, "NO M"], [52.1, "ANGIA SERVICE: All start 7: 3 0"]),
  line(5, [17, "3 rd party Dessert"]),
];

describe("battle board printed from the browser", () => {
  const part = bundlePartFromPdfLines(BOARD);

  it("is read as the battle board, with title, invoice, date and guests", () => {
    expect(part?.source).toBe("battleBoard");
    expect(part?.header).toEqual({
      title: "Lane Wedding",
      invoiceNumber: "6201",
      eventDate: "2026-06-27",
      guestCount: 120,
    });
  });

  it("reads the staff roster with role, team, shift and station", () => {
    expect(part?.staff).toEqual([
      {
        name: "Avery Pine",
        role: "Catering - BOH LEAD",
        team: "BOH",
        startMinutes: 15 * 60 + 30,
        endMinutes: 23 * 60 + 30,
        station: "BOH",
      },
      {
        name: "Jo Reed",
        role: "Catering - FOH",
        team: "FOH",
        startMinutes: 18 * 60,
        endMinutes: 22 * 60,
        station: "FOH",
      },
    ]);
  });

  it("reads the notes under their headings, gaps closed, parking and restrooms kept", () => {
    expect(part?.notes).toEqual({
      serviceSetup: "Buffet along the east fence",
      operationsNotes: "Cooking in the barn bay",
      menuNotes: "x2 GF pies",
      decor: "Rustic kit",
      cateringKitchen:
        "Park by the barn\nStaff parking: back lot\nStaff restrooms: barn restrooms",
      additionalTasks: "NO MANGIA SERVICE: All start 7:30\n3rd party Dessert",
    });
  });
});

describe("event worksheet venue with a number in its name", () => {
  it("starts the street at the first whole number and splits a capital street type from the town", () => {
    const part = parseEventWorksheet([
      ["Event Worksheet", "Event Date:", "6/27/2026 - Saturday"],
      [
        "Contact:",
        "Sam Lane12 Elm StSpokane, WA 99201Home: 5095550100",
        "Venue:",
        "Private Residence - Hayden, 4th ST210 N 4th STHayden, ID 83835",
      ],
    ]);
    expect(part.venue).toMatchObject({
      name: "Private Residence - Hayden, 4th ST",
      addressLine1: "210 N 4th ST",
      city: "Hayden",
      region: "ID",
      postalCode: "83835",
    });
  });
});
