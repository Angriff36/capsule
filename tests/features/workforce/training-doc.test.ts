import { describe, expect, it } from "vitest";
import {
  initialledCount,
  initialsOf,
  parseInitials,
  parseTrainingSteps,
  serializeInitials,
  toggleInitial,
} from "../../../src/features/workforce/trainingDoc";
import { starterModules } from "../../../src/features/workforce/trainingStarters";

describe("training doc steps and initials", () => {
  it("reads steps with their detail lines", () => {
    expect(
      parseTrainingSteps(
        "Go over all kits\n- What is a kit\n\n- Why we use kits\nKit process when returning\r\n- Red magnets",
      ),
    ).toEqual([
      {
        text: "Go over all kits",
        details: ["What is a kit", "Why we use kits"],
      },
      { text: "Kit process when returning", details: ["Red magnets"] },
    ]);
    expect(parseTrainingSteps(null)).toEqual([]);
  });

  it("initials a step, clears it, and keeps the round trip", () => {
    const steps = parseTrainingSteps("A|B step\nSecond");
    let rows = toggleInitial([], "A|B step", "RC", 1000);
    rows = toggleInitial(rows, "Second", "RC", 2000);
    const text = serializeInitials(rows);
    expect(parseInitials(text)).toEqual(rows);
    expect(initialledCount(steps, rows)).toBe(2);
    rows = toggleInitial(rows, "Second", "RC", 3000);
    expect(initialledCount(steps, rows)).toBe(1);
    expect(parseInitials("bad line\nx|y|notanumber")).toEqual([]);
  });

  it("makes initials from a name", () => {
    expect(initialsOf("Rob Crew")).toBe("RC");
    expect(initialsOf("")).toBe("OK");
  });

  it("carries the four Mangia training docs on the warehouse starters", () => {
    for (const name of [
      "Event packing",
      "Book building",
      "Rebuild kits",
      "Design studio",
    ]) {
      const starter = starterModules.find((row) => row.name === name)!;
      expect(parseTrainingSteps(starter.steps).length).toBeGreaterThanOrEqual(
        4,
      );
      expect(starter.quiz).toMatch(/^Q: /);
    }
  });
});
