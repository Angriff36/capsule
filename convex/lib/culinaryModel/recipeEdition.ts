// Published recipe editions (PL-DEMAND, BE-9.6 publish control).
//
// Publishing a recipe saves the formula it was published with as a
// ComponentSnapshot row marked `edition: "published"`. The row keeps the
// history screen's shape (name, yields, `lines`) so it lists, compares and
// restores like every other saved version, and adds the sub-recipe lines and
// line ids the demand engine needs.
//
// The rule the demand engine follows:
// - a published recipe, or one never published, is used as it stands;
// - a recipe taken back to draft uses its last published edition until the
//   draft is published, so trying out changes never rewrites event demand.
// Finished events keep the demand they already have (see culinaryDemand.ts).

export const PUBLISHED_EDITION = "published";

export interface PublishedEditionLine {
  id: string;
  ingredientId: string;
  ingredientName?: string;
  quantity: number;
  unit: string;
  prepNotes?: string;
  sortOrder?: number;
  wasteFactor?: number;
  quantityBasis?: string | null;
}

export interface PublishedEditionSubRecipeLine {
  id: string;
  childComponentId: string;
  quantity: number;
  unit: string;
  wasteFactor?: number;
  quantityBasis?: string | null;
}

export interface PublishedEdition {
  edition: typeof PUBLISHED_EDITION;
  versionNumber: number;
  name: string;
  category: string;
  cuisine: string;
  description: string;
  instructions: string;
  yieldQuantity: number;
  yieldUnit: string;
  batchMultiplier: number;
  servesPerYield: number;
  lines: PublishedEditionLine[];
  componentLines: PublishedEditionSubRecipeLine[];
}

type RecipeRow = {
  name: string;
  category?: string | null;
  cuisine?: string | null;
  description?: string | null;
  instructions?: string | null;
  yieldQuantity?: number | null;
  yieldUnit?: string | null;
  batchMultiplier?: number | null;
  servesPerYield?: number | null;
  versionNumber: number;
};

type IngredientLineRow = {
  _id: string;
  ingredientId: string;
  quantity: number;
  unit: string;
  prepNotes?: string | null;
  sortOrder?: number | null;
  wasteFactor?: number | null;
  quantityBasis?: string | null;
  addedAt?: number | null;
  deletedAt?: number | null;
};

type SubRecipeLineRow = {
  _id: string;
  childComponentId: string;
  quantity: number;
  unit: string;
  wasteFactor?: number | null;
  quantityBasis?: string | null;
  addedAt?: number | null;
  deletedAt?: number | null;
};

const liveLine = (l: { addedAt?: number | null; deletedAt?: number | null }) =>
  l.addedAt != null && l.deletedAt == null;

/** The formula a recipe is published with, in the saved-version shape. */
export function buildPublishedEdition(
  recipe: RecipeRow,
  ingredientLines: IngredientLineRow[],
  subRecipeLines: SubRecipeLineRow[],
  ingredientName: (id: string) => string,
): PublishedEdition {
  return {
    edition: PUBLISHED_EDITION,
    versionNumber: recipe.versionNumber,
    name: recipe.name,
    category: recipe.category ?? "",
    cuisine: recipe.cuisine ?? "",
    description: recipe.description ?? "",
    instructions: recipe.instructions ?? "",
    yieldQuantity: Number(recipe.yieldQuantity ?? 0),
    yieldUnit: String(recipe.yieldUnit ?? ""),
    batchMultiplier: Number(recipe.batchMultiplier ?? 1),
    servesPerYield: Number(recipe.servesPerYield ?? 1),
    lines: ingredientLines
      .filter(liveLine)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((l) => ({
        id: String(l._id),
        ingredientId: String(l.ingredientId),
        ingredientName: ingredientName(String(l.ingredientId)),
        quantity: Number(l.quantity),
        unit: String(l.unit),
        prepNotes: l.prepNotes ?? "",
        sortOrder: l.sortOrder ?? 0,
        wasteFactor: l.wasteFactor ?? 1,
        quantityBasis: l.quantityBasis ?? null,
      })),
    componentLines: subRecipeLines.filter(liveLine).map((l) => ({
      id: String(l._id),
      childComponentId: String(l.childComponentId),
      quantity: Number(l.quantity),
      unit: String(l.unit),
      wasteFactor: l.wasteFactor ?? 1,
      quantityBasis: l.quantityBasis ?? null,
    })),
  };
}

/** A saved version that is a published edition, else null. */
export function parsePublishedEdition(json: string): PublishedEdition | null {
  try {
    const data = JSON.parse(json) as Partial<PublishedEdition>;
    if (
      !data ||
      data.edition !== PUBLISHED_EDITION ||
      !Array.isArray(data.lines) ||
      !Array.isArray(data.componentLines) ||
      !(Number(data.yieldQuantity) > 0)
    )
      return null;
    return data as PublishedEdition;
  } catch {
    return null;
  }
}

/**
 * The edition events should use for a recipe, or null to use the recipe as it
 * stands. Only a recipe taken back to draft after publishing has one.
 */
export function editionInUse(
  recipe: { status: string; versionNumber: number },
  saved: { versionNumber: number; snapshot: string }[],
): PublishedEdition | null {
  if (recipe.status !== "draft") return null;
  let best: PublishedEdition | null = null;
  for (const row of saved) {
    if (row.versionNumber >= recipe.versionNumber) continue;
    const edition = parsePublishedEdition(row.snapshot);
    if (!edition) continue;
    if (!best || edition.versionNumber > best.versionNumber) best = edition;
  }
  return best;
}
