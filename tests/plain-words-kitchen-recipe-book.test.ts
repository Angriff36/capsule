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
});
