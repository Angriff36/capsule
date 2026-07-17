export type KitchenSection = "recipes" | "ingredients" | "dishes" | "menus";

export const KITCHEN_SECTIONS: readonly {
  key: KitchenSection | "event-menu" | "prep";
  label: string;
  path: string;
}[] = [
  { key: "recipes", label: "Recipes", path: "/kitchen/recipes" },
  { key: "ingredients", label: "Ingredients", path: "/kitchen/ingredients" },
  { key: "dishes", label: "Dishes", path: "/kitchen/dishes" },
  { key: "menus", label: "Menus", path: "/kitchen/menus" },
  { key: "event-menu", label: "Event menu", path: "/kitchen/event-menu" },
  { key: "prep", label: "Prep", path: "/kitchen/prep" },
] as const;

export function recipePath(id: string) {
  return `/kitchen/recipes/${id}`;
}

export const RECIPE_IMPORT_PATH = "/kitchen/recipes/import";
