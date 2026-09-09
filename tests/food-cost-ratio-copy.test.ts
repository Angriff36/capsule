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
});
