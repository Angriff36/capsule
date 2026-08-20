import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createdIngredientId,
  filterEventMenuRecipeIngredients,
  parseEventMenuCreateIngredient,
  parseEventMenuCreateIngredientCost,
  resolveEventMenuRecipeIngredientId,
} from "../src/features/events/eventMenuRecipeIngredient";
import { formatEventMenuSellInput } from "../src/features/events/eventMenuSellPrice";
import { EVENT_MENU_CONTAINER_NAMES } from "../src/features/events/eventMenuContainers";

const editor = readFileSync(
  "src/features/events/EventMenuRecipeEditor.tsx",
  "utf8",
);
const tab = readFileSync("src/features/events/EventMenuTab.tsx", "utf8");

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
  it("is searchable, not a bare <select> of catalog names", () => {
    expect(editor).toContain(
      'data-testid="event-menu-recipe-ingredient-search"',
    );
    expect(editor).toContain("filterEventMenuRecipeIngredients");
    expect(editor).toContain("resolveEventMenuRecipeIngredientId");
    expect(editor).toContain('type="search"');
    expect(editor).not.toMatch(/<select[^>]*name="ingredientId"/);
    expect(editor).not.toMatch(
      /name="ingredientId"[\s\S]{0,400}ingredients \?\? \[\]/,
    );
  });

  it("can create an ingredient from the event menu editor at $0 / empty cost", () => {
    expect(editor).toContain("useCreateIngredient");
    expect(editor).toContain('data-testid="event-menu-create-ingredient"');
    expect(editor).toContain('data-testid="event-menu-create-ingredient-form"');
    expect(editor).toContain('data-testid="event-menu-create-ingredient-cost"');
    expect(editor).toContain("parseEventMenuCreateIngredient");
    expect(editor).not.toMatch(
      /name="newIngredientCost"[\s\S]{0,200}defaultValue=\{[^0]/,
    );
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

describe("event menu leftover paint and defaults", () => {
  it("defaults servings per pan to 20, not 25", () => {
    expect(editor).toMatch(
      /name="servingsPerContainer"[\s\S]{0,120}defaultValue=\{20\}/,
    );
    expect(editor).not.toMatch(
      /name="servingsPerContainer"[\s\S]{0,120}defaultValue=\{25\}/,
    );
  });

  it("offers the small shared container name list without inventing a vocab", () => {
    expect(EVENT_MENU_CONTAINER_NAMES).toEqual(["Hotel pan", "Half pan"]);
    expect(editor).toContain("EVENT_MENU_CONTAINER_NAMES");
    expect(editor).toContain('list="event-menu-container-names"');
  });

  it("paints sell as 2.00 / 0.50 / 1.00", () => {
    expect(formatEventMenuSellInput(2)).toBe("2.00");
    expect(formatEventMenuSellInput(0.5)).toBe("0.50");
    expect(formatEventMenuSellInput(1)).toBe("1.00");
    expect(formatEventMenuSellInput(0)).toBe("0.00");
    expect(tab).toContain("formatEventMenuSellInput");
    expect(tab).toContain("lineFields.unitSellPrice");
    expect(tab).not.toContain('defaultValue={lineFields.unitSellPrice ?? ""}');
  });
});
