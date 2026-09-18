import { describe, expect, it } from "vitest";

import { parseBeoText } from "../src/lib/tppReports/parseBeoText";

/**
 * Shaped after a real TPP BEO paste (invoice 6839): several header facts on
 * one line, an unlabeled venue block above the street address, a "Venue
 * Contact:" line that must not become the client, a person on the
 * "Location:" line, and bare service-wave clock ranges inside a
 * 2:00 PM – 5:01 PM event.
 */
const BEO = `Banquet Event Order
Invoice #: 6839 Date: Tuesday 9/22/2026
Event Title: A Century Worth Celebrating Event Time: 2:00 PM - 5:01 PM
Occasion: **Social (Birthday Party, Anniversary, etc) Guest Count: 100
Fields Senior Living
16512 E Desmet Ct
Spokane Valley WA, 99216
Venue Contact: Kendra (venue person to direct
Contact Phone #: (541) 701 7521
Service Style: Buffet - Cook Onsite
Event Type: Social
Location:
Paul Brindle
Event Items
- 200 Serving Lasagna Meal (individually packaged)
Individually packaged. Lasagna with meat ragu.
**250 Trays of Lasagna
250 - 2ea Rolls + Butterchips
** Sauce on the side
2:00 - 3:00 1st Wave: 34 Prawns
3:00 - 4:00 2nd Wave: 33 Prawns
30 Serving Century Board`;

describe("parseBeoText pasted BEO reading", () => {
  const part = parseBeoText(BEO);

  it("splits multi-label header lines into separate facts", () => {
    expect(part.header.invoiceNumber).toBe("6839");
    expect(part.header.eventDate).toBe("2026-09-22");
    expect(part.header.title).toBe("A Century Worth Celebrating");
    expect(part.header.startMinutes).toBe(14 * 60);
    expect(part.header.endMinutes).toBe(17 * 60 + 1);
    expect(part.header.guestCount).toBe(100);
    expect(part.header.occasion).toBe(
      "Social (Birthday Party, Anniversary, etc)",
    );
  });

  it("reads the venue from the unlabeled block and the client from Location", () => {
    expect(part.venue?.name).toBe("Fields Senior Living");
    expect(part.venue?.city).toBe("Spokane Valley");
    expect(part.venue?.postalCode).toBe("99216");
    expect(part.client?.name).toBe("Paul Brindle");
    expect(part.client?.phone).toContain("541");
  });

  it("keeps the venue contact out of the client and venue names", () => {
    expect(part.client?.name).not.toContain("Kendra");
    expect(part.venue?.name).not.toContain("Kendra");
    expect(part.venue?.name).not.toContain("Paul Brindle");
  });

  it("reads BEO item-table rows marked with - or **", () => {
    const names = part.menu.map((item) => item.name);
    expect(names).toEqual([
      "Lasagna Meal (individually packaged)",
      "Trays of Lasagna",
      "- 2ea Rolls + Butterchips",
      "Century Board",
    ]);
    expect(part.menu[0]?.quantityServings).toBe(200);
    expect(part.menu[0]?.description).toBe(
      "Individually packaged. Lasagna with meat ragu.",
    );
    expect(part.menu[2]?.specialInstructions).toBe("Sauce on the side");
  });

  it("recognizes the run-on BEO item table header", () => {
    const table = parseBeoText(
      [
        "Time Service AreaEvent Item Service StyleQty",
        "- 200 Serving Lasagna Meal (individually packaged)",
        "**250 Trays of Lasagna",
      ].join("\n"),
    );
    expect(table.menu.map((item) => item.name)).toEqual([
      "Lasagna Meal (individually packaged)",
      "Trays of Lasagna",
    ]);
  });

  it("reads bare service-wave clock ranges as timeline rows", () => {
    expect(part.timeline.map((entry) => entry.name)).toEqual([
      "1st Wave: 34 Prawns",
      "2nd Wave: 33 Prawns",
    ]);
    expect(part.timeline[0]?.minutes).toBe(14 * 60);
    expect(part.timeline[1]?.minutes).toBe(15 * 60);
  });

  it("still warns when no date can be read", () => {
    const bare = parseBeoText("Event Items\n30 Serving Century Board");
    expect(bare.header.eventDate).toBeUndefined();
    expect(bare.warnings.join(" ")).toMatch(/no event date/i);
  });
});
