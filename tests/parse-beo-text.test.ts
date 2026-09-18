import { describe, expect, it } from "vitest";

import { parseBeoText } from "../src/lib/tppReports/parseBeoText";

/**
 * Shaped after a real TPP BEO paste (invoice 6839): several header facts on
 * one line, contact prose with phones and a ZIP, and bare service-wave clock
 * ranges inside a 2:00 PM – 5:01 PM event.
 */
const BEO = `Banquet Event Order
Invoice #: 6839 Date: Tuesday 9/22/2026
Event Title: A Century Worth Celebrating Event Time: 2:00 PM - 5:01 PM
Occasion: Social (Birthday Party, Anniversary, etc) Guest Count: 100
Venue: Fields Senior Living Venue Contact: Kendra (509) 555 0134
16512 E Desmet Ct
Spokane Valley WA, 99216
Contact: Paul Brindle
Contact Phone: (541) 701 7521 Contact Email: paul@example.com
Event Items
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

  it("reads the venue and client contact, not the address run-on", () => {
    expect(part.venue?.name).toBe("Fields Senior Living");
    expect(part.client?.name).toBe("Paul Brindle");
    expect(part.client?.phone).toContain("541");
    expect(part.client?.email).toBe("paul@example.com");
  });

  it("keeps address, ZIP and phone prose out of the menu", () => {
    const names = part.menu.map((item) => item.name);
    expect(names).toEqual(["Century Board"]);
    expect(part.menu[0]?.quantityServings).toBe(30);
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
