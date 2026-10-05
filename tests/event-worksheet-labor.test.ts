import { describe, expect, it } from "vitest";

import { parseEventWorksheet } from "../src/lib/tppReports/parseEventWorksheet";

/**
 * The Event Labor block of a TPP Event Worksheet for a drop-off event
 * (work/san-pedro, invoice 6867): a "Notes:" row about how the crew runs it,
 * then a role row and a person row with no shift times yet.
 */
const ROWS: string[][] = [
  ["Event Worksheet"],
  ["Invoice #:", "6867"],
  ["Event Labor"],
  [
    "Notes:",
    "This will be sent out as a bring hot with Mangia hotel pans and stainless chaffers but is DROP OFF service.",
  ],
  ["Staff Phone", "Sched In", "Sched Out", "Staff Note"],
  ["Catering - BOH"],
  ["[2] * Unassigned *"],
];

describe("Event Worksheet labor block", () => {
  const part = parseEventWorksheet(ROWS);

  it("reads the labor note as an operations note, not a person", () => {
    expect(part.notes?.operationsNotes).toBe(
      "This will be sent out as a bring hot with Mangia hotel pans and stainless chaffers but is DROP OFF service.",
    );
    expect(part.staff?.map((member) => member.name)).not.toContain("Notes:");
  });

  it("keeps an unassigned person row with no times under its role", () => {
    expect(part.staff).toEqual([
      { name: "[2]  Unassigned", role: "Catering - BOH" },
    ]);
  });
});
