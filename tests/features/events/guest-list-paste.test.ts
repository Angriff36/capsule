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

describe("guest paste with headings", () => {
  it("reads columns by their headings, in any order", () => {
    const guests = readGuestPaste(
      "Name\tEmail\tDietary\tAllergies\nMaria Lopez\tmaria@example.test\tVegetarian\t\nSam Chen\t\t\tShellfish",
      [],
    );
    expect(guests).toEqual([
      {
        name: "Maria Lopez",
        email: "maria@example.test",
        phone: undefined,
        dietaryRestrictions: ["Vegetarian"],
        allergenRestrictions: undefined,
      },
      {
        name: "Sam Chen",
        email: undefined,
        phone: undefined,
        dietaryRestrictions: undefined,
        allergenRestrictions: ["Shellfish"],
      },
    ]);
  });
  it("reads a heading row that does not start with the name", () => {
    expect(
      readGuestPaste(
        ["Email,Name,Allergies", "maria@example.test,Maria Lopez,nuts"].join(
          "\n",
        ),
        [],
      ),
    ).toEqual([
      {
        name: "Maria Lopez",
        email: "maria@example.test",
        phone: undefined,
        dietaryRestrictions: undefined,
        allergenRestrictions: ["nuts"],
      },
    ]);
  });
});
