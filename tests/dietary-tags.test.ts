import { describe, expect, it } from "vitest";
import { dietTagsOnly, isDietTag } from "../convex/lib/dietaryTags";
import { parseTppMenu } from "../convex/tppParser";
import { dietaryLine } from "../src/features/facilities/venueMenuCard";

describe("diet tags vs TPP kitchen and sales labels", () => {
  it("keeps diet words and drops the labels TPP keeps in the same Tags column", () => {
    expect(
      dietTagsOnly([
        "vegetarian",
        "gluten free",
        "dairy-free",
        "vegan",
        "halal",
        "pizza",
        "drop off",
        "sel24",
        "Finish Kitchen",
        "finish_at_event",
        "passed apps",
        "salad dressing",
        "sub-recipe",
        "prep item",
        "cook onsite",
        "ezcater",
      ]),
    ).toEqual(["vegetarian", "gluten free", "dairy-free", "vegan", "halal"]);
    expect(isDietTag("  ")).toBe(false);
  });

  it("a menu import keeps only the diet words and the raw tags for the record", () => {
    const menu = parseTppMenu({
      name: "Margherita Pizza",
      dietary_tags: "pizza; vegetarian; sel24; drop off",
    } as unknown as Parameters<typeof parseTppMenu>[0]);
    expect(menu.dietaryTags).toEqual(["vegetarian"]);
    expect(menu.rawTags).toBe("pizza; vegetarian; sel24; drop off");
  });

  it("the venue menu card shows no label as a diet", () => {
    expect(dietaryLine(["finish kitchen", "gluten_free", "pizza"])).toBe(
      "Gluten free",
    );
  });
});
