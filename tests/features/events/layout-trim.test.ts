import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  layoutAccessibilityText,
  layoutAreaLabel,
  layoutCategoryCounts,
  layoutHasInstructions,
  trimLayoutField,
} from "../../../src/features/events/layoutTrim";

const NON_STRINGS: readonly unknown[] = [
  null,
  undefined,
  12,
  { name: "Bar" },
  ["ramp"],
];

const layoutsPanel = readFileSync(
  "src/features/events/EventBattleBoardLayoutsPanel.tsx",
  "utf8",
);

describe("layoutTrim", () => {
  it("does not throw when a field the load path trims is not a string", () => {
    for (const value of NON_STRINGS) {
      expect(() => trimLayoutField(value)).not.toThrow();
      expect(() => layoutAreaLabel(value)).not.toThrow();
      expect(() => layoutHasInstructions(value)).not.toThrow();
      expect(() => layoutAccessibilityText(value)).not.toThrow();
      expect(() => layoutCategoryCounts([{ type: value }])).not.toThrow();
    }
  });

  it("skips non-strings and still trims real text", () => {
    expect(trimLayoutField(null)).toBe("");
    expect(trimLayoutField(undefined)).toBe("");
    expect(trimLayoutField(12)).toBe("");
    expect(trimLayoutField({ name: "Bar" })).toBe("");
    expect(trimLayoutField("  Main Bar  ")).toBe("Main Bar");
    expect(layoutAreaLabel(null)).toBe("Unnamed area");
    expect(layoutAreaLabel("  Bar  ")).toBe("Bar");
    expect(layoutHasInstructions(12)).toBe(false);
    expect(layoutHasInstructions("  setup  ")).toBe(true);
  });

  it("shows recorded accessibility strings and hides blanks", () => {
    expect(layoutAccessibilityText(["  ramp  ", "wide aisles"])).toBe(
      "ramp, wide aisles",
    );
    expect(layoutAccessibilityText([])).toBeNull();
    expect(layoutAccessibilityText(["  "])).toBeNull();
    expect(layoutAccessibilityText("  wheelchair  ")).toBe("wheelchair");
    expect(layoutAccessibilityText("   ")).toBeNull();
    expect(layoutAccessibilityText(null)).toBeNull();
    expect(layoutAccessibilityText({ note: "ramp" })).toBeNull();
  });

  it("wires the Layouts panel through the trim helpers", () => {
    expect(layoutsPanel).toContain("layoutAccessibilityText");
    expect(layoutsPanel).toContain("layoutCategoryCounts");
    expect(layoutsPanel).toContain("trimLayoutField");
    expect(layoutsPanel).toContain("layoutHasInstructions");
    expect(layoutsPanel).not.toContain("accessibilityNeeds.trim");
    expect(layoutsPanel).not.toContain("accessibilityNeeds?.trim");
  });
});
