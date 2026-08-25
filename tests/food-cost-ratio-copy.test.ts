import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  foodCostAgainstTargetCopy,
  foodCostVarianceCopy,
} from "../src/features/finance/foodCostPercentage";

describe("food-cost window ratio does not call $0 revenue a missing target", () => {
  it("keeps a saved 30% target distinct from unscored revenue", () => {
    expect(foodCostAgainstTargetCopy(null)).toBe("No revenue to score");
    expect(foodCostAgainstTargetCopy(null)).not.toContain("No revenue target");
    expect(foodCostVarianceCopy(null)).toBe("No revenue to score");
    expect(foodCostAgainstTargetCopy(0)).toBe("On target");
    expect(foodCostAgainstTargetCopy(2.4)).toBe("2.4 pts over target");
    expect(foodCostAgainstTargetCopy(-1.1)).toBe("1.1 pts under target");
  });

  it("Window ratio small print uses against-target copy, not concatenated target", () => {
    const page = readFileSync(
      "src/features/finance/FoodCostPercentagePage.tsx",
      "utf8",
    );
    expect(page).toContain("foodCostAgainstTargetCopy(report.totalVariance)");
    expect(page).not.toContain("} target</small>");
    expect(page).not.toContain("No revenue");
  });

  it("hero paper follows the theme panel, not cream", () => {
    const css = readFileSync(
      "src/features/finance/FoodCostPercentagePage.css",
      "utf8",
    );
    expect(css).toContain("--food-cost-paper: var(--color-panel)");
    expect(css).not.toContain("#f4f0e5");
    expect(css).not.toContain("255, 255, 255");
  });
});
