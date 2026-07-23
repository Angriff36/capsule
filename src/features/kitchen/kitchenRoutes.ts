export type KitchenSection = "recipes" | "ingredients" | "dishes" | "menus";

export const KITCHEN_SECTIONS: readonly {
  key: KitchenSection | "event-menu" | "prep" | "yield" | "allergens";
  label: string;
  path: string;
}[] = [
  { key: "recipes", label: "Recipes", path: "/kitchen/recipes" },
  { key: "ingredients", label: "Ingredients", path: "/kitchen/ingredients" },
  { key: "dishes", label: "Dishes", path: "/kitchen/dishes" },
  { key: "menus", label: "Menus", path: "/kitchen/menus" },
  { key: "event-menu", label: "Event menu", path: "/kitchen/event-menu" },
  { key: "allergens", label: "Allergens", path: "/kitchen/allergens" },
  { key: "prep", label: "Prep", path: "/kitchen/prep" },
  { key: "yield", label: "Yield", path: "/kitchen/yield" },
] as const;

export function recipePath(id: string) {
  return `/kitchen/recipes/${id}`;
}

export function ingredientPath(id: string) {
  return `/kitchen/ingredients/${id}`;
}

export function dishPath(id: string) {
  return `/kitchen/dishes/${id}`;
}

export function menuPath(id: string) {
  return `/kitchen/menus/${id}`;
}

export const RECIPE_IMPORT_PATH = "/kitchen/recipes/import";

export const ALLERGEN_MATRIX_PATH = "/kitchen/allergens";

export function allergenMatrixPath(scope: "menu" | "event", id: string) {
  return `${ALLERGEN_MATRIX_PATH}?${scope}=${id}`;
}

export function kitchenCatalogPath(section: KitchenSection) {
  return `/kitchen/${section}`;
}
