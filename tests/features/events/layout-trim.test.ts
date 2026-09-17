import { describe, expect, it } from "vitest";
import {
  layoutAccessibilityText,
  layoutAreaLabel,
  layoutHasInstructions,
  trimLayoutField,
} from "../../../src/features/events/layoutTrim";

describe("layoutTrim", () => {
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
});
