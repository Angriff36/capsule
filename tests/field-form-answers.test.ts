import { describe, expect, it } from "vitest";
import {
  blankChecklist,
  blankMuda,
  decodeAnswers,
  missedLines,
  mudaSummary,
} from "../src/lib/eventPacket/finalLock/fieldFormAnswers";
import { menuNames } from "../src/features/events/packet/FieldFormAnswerInputs";

describe("paper day-of form answers", () => {
  it("has the paper lines for leaving the shop and arrival only", () => {
    expect(blankChecklist("field.leaving-shop")).toHaveLength(15);
    expect(blankChecklist("field.arrival")).toHaveLength(10);
    expect(blankChecklist("field.bins")).toEqual([]);
    expect(missedLines(blankChecklist("field.arrival"))).toHaveLength(10);
  });

  it("writes the food waste form as one plain note", () => {
    expect(mudaSummary(blankMuda())).toBe(
      "Attendance not counted. No waste from a staff mistake. No main items left.",
    );
    expect(
      mudaSummary({
        ...blankMuda(),
        attendance: 92,
        staffError: true,
        staffErrorNote: "dropped a pan of prawns",
        appetizersUsed: true,
        appetizerStyles: ["passed"],
        mainsHandling: "given_to_client",
        leftovers: [
          { item: "Coconut Prawns", kind: "appetizer", amount: 12 },
          { item: "Beef Satay", kind: "main", amount: 2.5 },
        ],
      }),
    ).toBe(
      "About 92 guests came. Waste from a staff mistake: dropped a pan of prawns. Appetizers (passed) left: Coconut Prawns 12 servings. Main items left - given to client: Beef Satay 2.5 lb.",
    );
  });

  it("reads nothing from answers it does not know", () => {
    expect(decodeAnswers(null)).toBeNull();
    expect(decodeAnswers("2 pans left")).toBeNull();
    expect(decodeAnswers('{"kind":"other"}')).toBeNull();
  });

  it("offers the planned menu names to count against", () => {
    expect(menuNames("Prawns; Potato Bites; and 3 more")).toEqual([
      "Prawns",
      "Potato Bites",
    ]);
    expect(menuNames(null)).toEqual([]);
  });
});
