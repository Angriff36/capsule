import { describe, expect, it } from "vitest";
import {
  createdIngredientId,
  filterEventMenuRecipeIngredients,
  parseEventMenuCreateIngredient,
  parseEventMenuCreateIngredientCost,
  resolveEventMenuRecipeIngredientId,
} from "../src/features/events/eventMenuRecipeIngredient";

const PROD_CATALOG = [
  "Whole milk",
  "Mayo",
  "Brown sugar",
  "Elbow macaroni",
  "Cider vinegar",
  "Scallions",
  "Carrot",
  "Celery",
  "Corn",
  "Salmon fillet",
  "Lemon",
  "Unsalted butter",
  "TEST-0728 Basil",
  "Heirloom Tomato",
].map((name, index) => ({ id: `ing-${index}`, name }));

const MISSING = [
  "carne",
  "pollo",
  "beans",
  "tortillas",
  "sour cream",
  "lettuce",
  "cotija",
  "onion",
  "cilantro",
  "rice",
  "pico",
  "guac",
  "chips",
  "lemonade",
  "infused water kit",
  "radish",
];

describe("event menu recipe ingredient picker", () => {
  it("accepts blank and zero cost in an ingredient creation payload", () => {
    expect(parseEventMenuCreateIngredientCost("")).toBe(0);
    expect(parseEventMenuCreateIngredientCost("0")).toBe(0);
    expect(parseEventMenuCreateIngredientCost("0.00")).toBe(0);
    expect(
      parseEventMenuCreateIngredient({
        name: "Carne asada",
        unit: "pound",
        costRaw: "",
      }),
    ).toEqual({
      ok: true,
      value: { name: "Carne asada", unit: "pound", costPerUnit: 0 },
    });
    expect(createdIngredientId({ docId: "ing-carne" })).toBe("ing-carne");
  });

  it("does not match TPP menu items missing from the 14-name prod catalog", () => {
    expect(PROD_CATALOG).toHaveLength(14);
    for (const query of MISSING) {
      const hits = filterEventMenuRecipeIngredients(PROD_CATALOG, query);
      expect(
        hits.map((row) => row.name),
        query,
      ).not.toContainEqual(
        expect.stringMatching(new RegExp(`^${query}$`, "i")),
      );
    }
    expect(
      filterEventMenuRecipeIngredients(PROD_CATALOG, "milk").map(
        (row) => row.name,
      ),
    ).toContain("Whole milk");
    expect(filterEventMenuRecipeIngredients(PROD_CATALOG, "")).toEqual([]);
    expect(
      resolveEventMenuRecipeIngredientId(PROD_CATALOG, "", "Whole milk"),
    ).toBe("ing-0");
    expect(
      resolveEventMenuRecipeIngredientId(PROD_CATALOG, "", "carne"),
    ).toBeNull();
  });
});
