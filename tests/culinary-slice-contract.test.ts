import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(relativePath, "utf8");

describe("Culinary planning slice contract", () => {
  it("wires the Kitchen route family to authored culinary screens", () => {
    const app = read("src/app/App.tsx");
    expect(app).toContain('path="/kitchen/recipes"');
    expect(app).toContain('path="/kitchen/recipes/:id"');
    expect(app).toContain('path="/kitchen/ingredients"');
    expect(app).toContain('path="/kitchen/dishes"');
    expect(app).toContain('path="/kitchen/menus"');
    expect(app).toContain('path="/kitchen/event-menu"');
    expect(app).not.toContain("KitchenRoutePlaceholder");
  });

  it("uses generated reads and command hooks in authored feature code", () => {
    const catalog = read("src/features/kitchen/KitchenCatalogPage.tsx");
    const recipe = read("src/features/kitchen/RecipeDetailPage.tsx");
    const eventMenu = read("src/features/kitchen/EventMenuPage.tsx");

    for (const hook of [
      "useListIngredient",
      "useListRecipe",
      "useListDish",
      "useListMenu",
    ]) {
      expect(catalog).toContain(hook);
    }
    for (const hook of [
      "useGetRecipe",
      "useRecipeReviseDraft",
      "useRecipeIngredientAdjustQuantity",
      "useRecipeIngredientRemove",
    ]) {
      expect(recipe).toContain(hook);
    }
    for (const hook of [
      "useListEvent",
      "useListEventDish",
      "useEventDishAdjustServings",
      "useEventDishRemove",
    ]) {
      expect(eventMenu).toContain(hook);
    }
  });

  it("uses governed generated creation hooks without an authored allocation seam", () => {
    const catalog = read("src/features/kitchen/KitchenCatalogPage.tsx");
    const recipe = read("src/features/kitchen/RecipeDetailPage.tsx");
    const eventMenu = read("src/features/kitchen/EventMenuPage.tsx");

    for (const hook of [
      "useCreateIngredient",
      "useCreateRecipe",
      "useCreateDish",
      "useCreateMenu",
    ]) {
      expect(catalog).toContain(hook);
    }
    expect(recipe).toContain("useCreateRecipeIngredient");
    expect(eventMenu).toContain("useCreateEventDish");
    for (const source of [catalog, recipe, eventMenu]) {
      expect(source).not.toContain('from "./culinaryPlanningApi"');
      expect(source).toContain('from "../../lib/manifest-convex-react"');
    }
  });

  it("uses generated lifecycle metadata for every authored state offer", () => {
    const policy = read("src/features/kitchen/CulinaryLifecyclePolicy.ts");
    expect(policy).toContain('from "../../generated/manifest-wiring-bindings"');
    for (const metadata of [
      "RecipePublishVersionLifecycle",
      "RecipeRetractLifecycle",
      "RecipeRetireLifecycle",
      "IngredientDiscontinueLifecycle",
      "IngredientReinstateLifecycle",
      "DishRetireLifecycle",
      "DishReinstateLifecycle",
      "MenuMarkPublishedLifecycle",
      "MenuUnpublishLifecycle",
      "MenuArchiveLifecycle",
      "MenuRestoreLifecycle",
    ]) {
      expect(policy).toContain(metadata);
    }
  });
});
