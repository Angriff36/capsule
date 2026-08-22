import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(relativePath, "utf8");

describe("Culinary planning slice contract", () => {
  it("wires the Kitchen route family to authored culinary screens", () => {
    const app = read("src/app/App.tsx");
    expect(app).toContain('path="/kitchen/components"');
    expect(app).toContain('path="/kitchen/components/import"');
    expect(app).toContain('path="/kitchen/components/:id"');
    expect(app).toContain('path="/kitchen/ingredients"');
    expect(app).toContain('path="/kitchen/ingredients/:id"');
    expect(app).toContain('path="/kitchen/dishes"');
    expect(app).toContain('path="/kitchen/dishes/:id"');
    expect(app).toContain('path="/kitchen/menus"');
    expect(app).toContain('path="/kitchen/menus/:id"');
    expect(app).toContain('path="/kitchen/event-menu"');
    expect(app).not.toContain("KitchenRoutePlaceholder");
  });

  it("uses generated reads and command hooks in authored feature code", () => {
    const catalog = read("src/features/kitchen/KitchenCatalogPage.tsx");
    const component = read("src/features/kitchen/ComponentDetailPage.tsx");
    const ingredient = read("src/features/kitchen/IngredientDetailPage.tsx");
    const dish = read("src/features/kitchen/DishDetailPage.tsx");
    const menu = read("src/features/kitchen/MenuDetailPage.tsx");
    const eventMenu =
      read("src/features/events/EventMenuTab.tsx") +
      read("src/features/kitchen/useEventMenuSync.ts");
    const componentImport = read(
      "src/features/kitchen/import/ComponentImportPage.tsx",
    );

    for (const hook of [
      "useListIngredient",
      "useListComponent",
      "useListDish",
      "useListMenu",
    ]) {
      expect(catalog).toContain(hook);
    }
    for (const hook of [
      "useGetComponent",
      "useComponentReviseDraft",
      "useComponentIngredientAdjustQuantity",
      "useComponentIngredientRemove",
    ]) {
      expect(component).toContain(hook);
    }
    expect(ingredient).toContain("useGetIngredient");
    expect(dish).toContain("useGetDish");
    expect(menu).toContain("useGetMenu");
    for (const hook of [
      "useCreateIngredient",
      "useCreateComponent",
      "useCreateComponentIngredient",
    ]) {
      expect(componentImport).toContain(hook);
    }
    // The event comes from the detail route; the tab does not list events.
    for (const hook of [
      "useListEventDish",
      "useEventDishAdjustServings",
      "useEventDishRemove",
      "useListDishTask",
      "useListPrepTask",
      "useListIngredientDemand",
      "useCreatePrepTask",
      "usePrepTaskRefreshGenerated",
    ]) {
      expect(eventMenu).toContain(hook);
    }
    // Component → IngredientDemand is Manifest-owned; menu UI does not create demand.
    expect(eventMenu).not.toContain("useCreateIngredientDemand");
    expect(eventMenu).toContain("EventMenuSyncController");
  });

  it("uses governed generated creation hooks without an authored allocation seam", () => {
    const catalog = read("src/features/kitchen/KitchenCatalogPage.tsx");
    const component = read("src/features/kitchen/ComponentDetailPage.tsx");
    const eventMenu =
      read("src/features/events/EventMenuTab.tsx") +
      read("src/features/kitchen/useEventMenuSync.ts");

    for (const hook of [
      "useCreateIngredient",
      "useCreateComponent",
      "useCreateDish",
      "useCreateMenu",
    ]) {
      expect(catalog).toContain(hook);
    }
    expect(component).toContain("useCreateComponentIngredient");
    expect(eventMenu).toContain("useCreateEventDish");
    for (const source of [catalog, component, eventMenu]) {
      expect(source).not.toContain('from "./culinaryPlanningApi"');
      expect(source).toContain('from "../../lib/manifest-convex-react"');
    }
  });

  it("uses generated lifecycle metadata for menu/component publish offers", () => {
    const policy = read("src/features/kitchen/CulinaryLifecyclePolicy.ts");
    expect(policy).toContain('from "../../generated/manifest-wiring-bindings"');
    for (const metadata of [
      "ComponentPublishVersionLifecycle",
      "ComponentRetractLifecycle",
      "MenuMarkPublishedLifecycle",
      "MenuUnpublishLifecycle",
      "MenuArchiveLifecycle",
      "MenuRestoreLifecycle",
    ]) {
      expect(policy).toContain(metadata);
    }
    // Delete is one-click purge — not lifecycle-gated retire/discontinue.
    expect(policy).toContain('key: "purge"');
    expect(policy).toContain('label: "Delete"');
  });
});
