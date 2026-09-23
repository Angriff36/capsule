import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on kitchen screens", () => {
  it("keeps kitchen nutrition copy free of record jargon", () => {
    const menuDetail = readFileSync(
      "src/features/kitchen/MenuDetailPage.tsx",
      "utf8",
    );
    const nutritionPanel = readFileSync(
      "src/features/kitchen/ComponentNutritionPanel.tsx",
      "utf8",
    );

    expect(menuDetail).not.toContain("with recorded nutrition");
    expect(nutritionPanel).not.toContain("without recorded nutrition");

    expect(menuDetail).toContain("with nutrition on file");
    expect(nutritionPanel).toContain(
      "Ingredients without nutrition on file are",
    );

    expectPlain("with nutrition on file");
    expectPlain("Ingredients without nutrition on file are");
  });

  it("keeps leftover kitchen catalog copy free of record jargon", () => {
    const files = [
      "src/features/kitchen/DishDetailsEditor.tsx",
      "src/features/kitchen/IngredientDetailsEditor.tsx",
      "src/features/kitchen/MenuDetailsEditor.tsx",
      "src/features/kitchen/KitchenCatalogCreateForm.tsx",
      "src/features/kitchen/KitchenCatalogPage.tsx",
      "src/features/kitchen/KitchenCatalogCards.tsx",
      "src/features/kitchen/KitchenDashboardPage.tsx",
      "src/features/kitchen/IngredientDetailPage.tsx",
      "src/features/kitchen/ItemUnitMappingsPanel.tsx",
      "src/features/kitchen/ComponentMethodStepsPanel.tsx",
      "src/features/kitchen/ComponentVersionHistoryPanel.tsx",
      "src/features/kitchen/ComponentPortionSpecsPanel.tsx",
      "src/features/kitchen/culinary-studio/CulinaryCatalogCardCopy.ts",
      "src/features/kitchen/culinary-studio/CulinaryCatalogCardTone.ts",
    ];
    const contents = Object.fromEntries(
      files.map((path) => [path, readFileSync(path, "utf8")]),
    );
    const all = Object.values(contents).join("\n");

    for (const old of [
      "Catalog record",
      "Menu record",
      "New record",
      "All records",
      "drill into the record",
      'formatCountNoun(displayRows.length, "record")',
      "No records match this search.",
      "matching records",
      "Open full record",
      "Record details",
      '?? "Record"',
      "reason not recorded",
      "None recorded",
      "No source recorded",
      "Record conversion",
      "Record one when a pack",
      "No method recorded.",
      "No prior versions recorded yet.",
      "No portion size recorded.",
      "No description recorded",
    ]) {
      expect(all).not.toContain(old);
    }

    expect(
      contents[
        "src/features/kitchen/culinary-studio/CulinaryCatalogCardTone.ts"
      ],
    ).not.toContain('return "Record";');
    expect(
      contents[
        "src/features/kitchen/culinary-studio/CulinaryCatalogCardTone.ts"
      ],
    ).toContain('return "Kitchen item";');

    for (const fresh of [
      "This dish",
      "This ingredient",
      "This menu",
      "New item",
      "All items",
      "then open the one that needs",
      'formatCountNoun(displayRows.length, "item")',
      "Nothing matches this search.",
      "matching items",
      "Open full card",
      "Item details",
      '?? "Item"',
      "Blocked — no reason on file.",
      "None on file",
      "No source on file",
      "Save conversion",
      "Add one when a pack",
      "No method on file.",
      "No earlier versions on file yet.",
      "No portion size on file.",
      "No description on file",
      "Kitchen item",
    ]) {
      expect(all).toContain(fresh);
    }

    // The fresh user-visible strings must themselves be plain catering English.
    for (const fresh of [
      "This dish",
      "This ingredient",
      "This menu",
      "New item",
      "All items",
      "Nothing matches this search.",
      "matching items",
      "Open full card",
      "Item details",
      "Blocked — no reason on file.",
      "None on file",
      "No source on file",
      "Save conversion",
      "No method on file.",
      "No earlier versions on file yet.",
      "No portion size on file.",
      "No description on file",
      "Kitchen item",
    ]) {
      expectPlain(fresh);
    }
  });
});
