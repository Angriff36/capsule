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

describe("plain words on the kitchen recipe book", () => {
  it("keeps recipe book entry points free of component jargon", () => {
    const routes = readFileSync(
      "src/features/kitchen/kitchenRoutes.ts",
      "utf8",
    );
    const catalog = readFileSync(
      "src/features/kitchen/KitchenCatalogPage.tsx",
      "utf8",
    );
    const importPage = readFileSync(
      "src/features/kitchen/import/ComponentImportPage.tsx",
      "utf8",
    );
    const palette = readFileSync("src/app/shell/CommandPalette.tsx", "utf8");
    const all = [routes, catalog, importPage, palette].join("\n");

    // The identifier `import-component` and the path `/kitchen/components`
    // are not user text — they stay. Only the words do.
    expect(all).not.toContain("Import component");
    expect(all).not.toContain("Component import");
    expect(all).not.toContain('components: "component"');
    expect(all).not.toContain("All {section}");
    expect(all).not.toContain("Search ${section}");
    expect(all).not.toContain("No {section} yet");

    expect(routes).toContain('components: "recipe"');
    expect(catalog).toContain("Import recipe");
    expect(catalog).toContain("All {sectionLabel.toLowerCase()}");
    expect(catalog).toContain(
      "Search ${sectionLabel.toLowerCase()} by name or category…",
    );
    expect(catalog).toContain("No {sectionLabel.toLowerCase()} yet");
    expect(importPage).toContain("Import recipe");
    expect(palette).toContain('label: "Import recipe"');

    // The fresh user-visible strings must themselves be plain catering English.
    for (const fresh of [
      "Import recipe",
      "New recipe",
      "Add recipe",
      "All recipes",
      "Search recipes by name or category…",
      "No recipes yet",
    ]) {
      expectPlain(fresh);
    }
  });

  it("keeps leftover kitchen recipe-book crumbs and page guide free of component jargon", () => {
    const guides = readFileSync("src/app/guide/pageGuides.ts", "utf8");
    const crumbs = readFileSync("src/app/shell/breadcrumbs.ts", "utf8");
    const all = [guides, crumbs].join("\n");

    expect(all).not.toContain("Recipes & components");
    expect(all).not.toContain("Create a component");
    expect(guides).toContain('title: "Recipes"');
    expect(crumbs).toContain('Recipes: "Recipe"');
    expect(guides).toContain("Create a recipe with its ingredients and yield.");

    for (const fresh of [
      "Recipes",
      "Recipe",
      "Create a recipe with its ingredients and yield.",
    ]) {
      expectPlain(fresh);
    }
  });

  it("keeps leftover kitchen catalog card kind label free of component jargon", () => {
    const tone = readFileSync(
      "src/features/kitchen/culinary-studio/CulinaryCatalogCardTone.ts",
      "utf8",
    );

    expect(tone).not.toContain('return "Component"');
    expect(tone).toContain('return "Recipe"');
    expect(tone).toContain('return "Ingredient"');
    expect(tone).toContain('return "Dish"');
    expect(tone).toContain('return "Menu"');
    expect(tone).toContain('return "Kitchen item"');

    expectPlain("Recipe");
  });

  it("keeps leftover kitchen recipe detail copy free of component jargon", () => {
    const detail = readFileSync(
      "src/features/kitchen/ComponentDetailPage.tsx",
      "utf8",
    );

    // The file name and identifiers stay — only the words a person reads.
    expect(detail).not.toContain('useTrackRecent("Component"');
    expect(detail).not.toContain('title="Component not found"');
    expect(detail).not.toContain("This component is unavailable");
    expect(detail).not.toContain("← Component index");
    expect(detail).not.toContain("Component · Edition");
    expect(detail).not.toContain("from this component.");
    expect(detail).not.toContain("publish this component");
    expect(detail).not.toContain("uses this component.");
    expect(detail).not.toContain("when the component is ready");
    expect(detail).not.toContain("Revise component");

    expect(detail).toContain('useTrackRecent("Recipe"');
    expect(detail).toContain('title="Recipe not found"');
    expect(detail).toContain("This recipe is unavailable or no longer exists.");
    expect(detail).toContain("← Recipes");
    expect(detail).toContain("Recipe · Edition");
    expect(detail).toContain("from this recipe.");
    expect(detail).toContain("You can still publish this recipe");
    expect(detail).toContain("No plated dish uses this recipe.");
    expect(detail).toContain("when the recipe is ready");
    expect(detail).toContain("Revise recipe");

    for (const fresh of [
      "Recipe not found",
      "This recipe is unavailable or no longer exists.",
      "← Recipes",
      "No plated dish uses this recipe.",
      "Revise recipe",
    ]) {
      expectPlain(fresh);
    }
  });
});
