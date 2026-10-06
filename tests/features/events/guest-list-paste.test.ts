import { describe, expect, it } from "vitest";
import { readGuestPaste } from "../../../src/features/events/guestListPaste";

describe("pasted guest list", () => {
  it("reads spreadsheet rows and typed rows, skipping the header and known names", () => {
    const out = readGuestPaste(
      [
        "Name\tEmail\tPhone\tDietary\tAllergies",
        "Maria Lopez\tmaria@example.com\t\tvegetarian\tpeanuts; shellfish",
        "",
        "Sam Ortiz, , 509-555-0100, , ",
        "ann lee",
        "Maria Lopez",
      ].join("\n"),
      ["Ann Lee"],
    );
    expect(out).toEqual([
      {
        name: "Maria Lopez",
        email: "maria@example.com",
        phone: undefined,
        dietaryRestrictions: ["vegetarian"],
        allergenRestrictions: ["peanuts", "shellfish"],
      },
      {
        name: "Sam Ortiz",
        email: undefined,
        phone: "509-555-0100",
        dietaryRestrictions: undefined,
        allergenRestrictions: undefined,
      },
    ]);
  });
});
