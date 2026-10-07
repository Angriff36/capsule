import { describe, expect, it } from "vitest";
import { suggestAllergens } from "../../../src/features/kitchen/IngredientQuickCreate";

describe("quick-add ingredient allergens", () => {
  it("ticks the allergens a name points to", () => {
    expect(suggestAllergens("All-purpose flour")).toEqual(["wheat"]);
    expect(suggestAllergens("Butter, Unsalted")).toEqual(["milk"]);
    expect(suggestAllergens("Large eggs")).toEqual(["eggs"]);
    expect(suggestAllergens("Candied walnuts")).toEqual(["tree_nuts"]);
    expect(suggestAllergens("Kosher salt")).toEqual([]);
    expect(suggestAllergens("Eggplant")).toEqual([]);
  });
});
