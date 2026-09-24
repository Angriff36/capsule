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

  it("keeps leftover kitchen cleanup prep and substitute copy free of record jargon", () => {
    const files = [
      "src/features/kitchen/KitchenCatalogCleanupPage.tsx",
      "src/features/kitchen/DishContainersPanel.tsx",
      "src/features/kitchen/ComponentRecipeStatusPanel.tsx",
      "src/features/kitchen/ComponentPrepContext.tsx",
      "src/features/kitchen/CulinaryRecordPicker.tsx",
      "src/features/kitchen/AllergenMatrixPage.tsx",
      "src/features/kitchen/EventPrepTaskSynchronizer.ts",
      "src/features/kitchen/IngredientDetailPage.tsx",
      "src/features/kitchen/IngredientSubstitutionEditor.tsx",
      "src/features/kitchen/EventMenuStockShortageBanner.tsx",
    ];
    const contents = Object.fromEntries(
      files.map((path) => [path, readFileSync(path, "utf8")]),
    );
    const all = Object.values(contents).join("\n");

    for (const old of [
      "names the new record",
      "No suggestions recorded yet",
      "Run the planner script",
      "catalog-reclassification-plan.ts",
      "No serving containers recorded",
      "unavailable for this record",
      "Recorded prep amount",
      "distinct record",
      "no allergen is recorded",
      "Cannot reconcile remaining work",
      "recorded work has incompatible",
      "tenant-wide default vendor",
      "Mapped substitutes",
      "mapped</span>",
      "Mapped ingredient substitutes",
      "No substitutes mapped yet",
      "Map same-unit ingredients",
      "Mapped substitutes have no unreserved",
      "No substitutes are mapped",
    ]) {
      expect(all).not.toContain(old);
    }

    for (const fresh of [
      "names the new item",
      "No suggestions on file yet",
      "Ask someone who can plan catalog cleanup",
      "No serving containers on file",
      "isn't available for this item",
      "Prep amount on file",
      "create a separate item only if",
      "no allergen is on file",
      "Can't update leftover prep",
      "amounts already done use different units",
      "this kitchen's usual vendor",
      "Saved substitutes",
      "on file</span>",
      "Saved ingredient substitutes",
      "No substitutes on file yet",
      "Add same-unit ingredients",
      "Saved substitutes have no leftover stock",
      "No substitutes are on file for this ingredient yet",
    ]) {
      expect(all).toContain(fresh);
    }

    // The fresh user-visible strings must themselves be plain catering English.
    for (const fresh of [
      "and its link names the new item.",
      "No suggestions on file yet. Ask someone who can plan catalog cleanup to generate them for this kitchen.",
      "No serving containers on file.",
      "Recipe status isn't available for this item.",
      "Prep amount on file",
      "create a separate item only if",
      "no allergen is on file",
      "Can't update leftover prep for Chocolate Sauce: the amounts already done use different units or aren't valid numbers.",
      "Purchasing will use this kitchen's usual vendor.",
      "Saved substitutes",
      "No substitutes on file yet.",
      "Add same-unit ingredients so shortages come with options.",
      "Saved substitutes have no leftover stock in this unit.",
      "No substitutes are on file for this ingredient yet.",
    ]) {
      expectPlain(fresh);
    }
  });

  it("keeps leftover kitchen command-deck copy free of command jargon", () => {
    const files = [
      "src/features/kitchen/kitchenRoutes.ts",
      "src/features/events/EventPrepTab.tsx",
    ];
    const all = files.map((path) => readFileSync(path, "utf8")).join("\n");

    // Strip comments and hyphenated identifiers (kitchen-command-deck) so the
    // "command deck" phrase check only sees user-visible text.
    const visible = all
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
      .replace(/\b[A-Za-z]+(?:-[A-Za-z]+)+\b/g, " ");

    expect(all).not.toContain("Command deck");
    expect(all).not.toContain("Open command deck");
    expect(visible).not.toMatch(/command\s+deck/i);

    expect(all).toContain('label: "Prep board"');
    expect(all).toContain("Open prep board");

    expectPlain("Prep board");
    expectPlain("Open prep board");
  });

  it("keeps leftover kitchen shortage banner copy free of mapped jargon", () => {
    const banner = readFileSync(
      "src/features/kitchen/EventMenuStockShortageBanner.tsx",
      "utf8",
    );

    expect(banner).not.toContain("Mapped alternatives");
    expect(banner).not.toContain("Component demand could not be fully held");
    expect(banner).not.toContain("source component has not been changed");

    const visible = banner.replace(/\s+/g, " ");
    expect(visible).toContain("Not enough of this ingredient is on hold");
    expect(visible).toContain("Saved substitutes are ranked for the kitchen");
    expect(visible).toContain("the original ingredient is unchanged");

    expectPlain(
      "Not enough of this ingredient is on hold. Saved substitutes are ranked for the kitchen; the original ingredient is unchanged.",
    );
  });

  it("keeps leftover kitchen portion-spec screen copy free of spec jargon", () => {
    const panel = readFileSync(
      "src/features/kitchen/DishComponentPortionSpecPanel.tsx",
      "utf8",
    );

    for (const old of [
      "Portion spec saved for",
      "Could not save the portion spec.",
      "<h2>Portion specs</h2>",
      "Component unavailable",
      "No portion specs on this subrecipe",
      "<span>Portion spec</span>",
      "Plain yield (no spec)",
      "Save portion spec",
    ]) {
      expect(panel).not.toContain(old);
    }

    expect(panel).toContain("Portion size saved for");
    expect(panel).toContain("Could not save the portion size.");
    expect(panel).toContain("<h2>Portion sizes</h2>");
    expect(panel).toContain("Recipe unavailable");
    expect(panel).toContain(
      "No portion sizes on this subrecipe — add one on its page first.",
    );
    expect(panel).toContain("<span>Portion size</span>");
    expect(panel).toContain("Plain yield (no size)");
    expect(panel).toContain("Save portion size");

    // The fresh user-visible strings must themselves be plain catering English.
    for (const fresh of [
      "Portion size saved for the subrecipe.",
      "Could not save the portion size.",
      "Portion sizes",
      "Recipe unavailable",
      "No portion sizes on this subrecipe — add one on its page first.",
      "Portion size",
      "Plain yield (no size)",
      "Save portion size",
    ]) {
      expectPlain(fresh);
    }
  });

  it("keeps leftover dish subrecipe panel copy free of component jargon", () => {
    const panel = readFileSync(
      "src/features/kitchen/DishComponentsPanel.tsx",
      "utf8",
    );

    for (const old of [
      "Pick a component to attach.",
      "Component attached.",
      "Could not attach the component.",
      "Detach component",
      "Component detached.",
      "Could not detach the component.",
      "Component unavailable",
      '"this component"',
      '"Detach"',
      ">Component</span>",
      "Select a component…",
      "the component&apos;s own",
      "Attach component",
      "Attaching…",
    ]) {
      expect(panel).not.toContain(old);
    }

    expect(panel).toContain("Pick a subrecipe to add.");
    expect(panel).toContain("Subrecipe added.");
    expect(panel).toContain("Could not add the subrecipe.");
    expect(panel).toContain("Remove subrecipe");
    expect(panel).toContain("Subrecipe removed.");
    expect(panel).toContain("Could not remove the subrecipe.");
    expect(panel).toContain("Recipe unavailable");
    expect(panel).toContain('"this subrecipe"');
    expect(panel).toContain('"Remove"');
    expect(panel).toContain(">Subrecipe</span>");
    expect(panel).toContain("Select a subrecipe…");
    expect(panel).toContain("the subrecipe&apos;s own");
    expect(panel).toContain("Add subrecipe");
    expect(panel).toContain("Adding…");

    // The fresh user-visible strings must themselves be plain catering English.
    for (const fresh of [
      "Pick a subrecipe to add.",
      "Subrecipe added. Its ingredients now drive demand, purchasing, and food cost for every event using this dish.",
      "Could not add the subrecipe.",
      "Remove subrecipe",
      "Subrecipe removed.",
      "Could not remove the subrecipe.",
      "Recipe unavailable",
      "this subrecipe",
      "Select a subrecipe…",
      "Add subrecipe",
    ]) {
      expectPlain(fresh);
    }
  });
});
