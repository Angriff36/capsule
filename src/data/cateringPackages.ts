import catalog from "./catering-packages.json";

export type CateringRecipe = {
  id: string;
  name: string;
  description: string;
  book: string;
  page: number;
  course: string;
};

export type CateringPackage = {
  id: string;
  name: string;
  book: string;
  page: number;
  serviceStyle: string;
  notes: string;
  groups: {
    label: string;
    recipeIds: string[];
    defaultCount: number;
    choice: boolean;
    splitServings: boolean;
  }[];
  serviceTasks?: string[];
  packing?: string[];
};

export const cateringBooks: Readonly<Record<string, string>> = catalog.books;
export const cateringPackages: readonly CateringPackage[] = catalog.packages;
export const cateringRecipes = new Map<string, CateringRecipe>(
  catalog.recipes.map((recipe) => [recipe.id, recipe]),
);

export function cateringSource(source: { book: string; page: number }) {
  return `${cateringBooks[source.book]} · page ${source.page}`;
}

export function cateringNameKey(name: string) {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type CateringSelection = {
  recipeId: string;
  servings: number;
  notes: string;
};

/** Split options share the guest count; duet entrees each serve every guest. */
export function defaultCateringSelections(
  pack: CateringPackage,
  headcount: number,
): CateringSelection[] {
  const guests = Math.max(1, Math.round(headcount || 1));
  const selections = new Map<string, CateringSelection>();
  for (const group of pack.groups) {
    const selected = group.recipeIds.slice(0, group.defaultCount);
    selected.forEach((recipeId, index) => {
      const servings = group.splitServings
        ? Math.floor(guests / selected.length) +
          (index < guests % selected.length ? 1 : 0)
        : guests;
      if (servings > 0 && !selections.has(recipeId)) {
        selections.set(recipeId, { recipeId, servings, notes: "" });
      }
    });
  }
  return [...selections.values()];
}
