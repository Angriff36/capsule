import {
  CULINARY_ALLERGENS,
  type CulinaryAllergenCode,
} from "./CulinaryAllergenVocabulary";

/**
 * Dish allergen derivation from the ACTUAL recipe, shared by the kitchen
 * allergen matrix and the Event Day menu. A dish reaches ingredients two
 * ways, and both count: direct DishIngredient lines and component lines
 * (dish → DishComponent → ComponentIngredient → Ingredient). The stored
 * dish.allergenSummary is unioned in as "Declared on dish" — a declared
 * allergen is never dropped, even when no ingredient line explains it.
 *
 * Draft lines (addedAt == null) are included on purpose: for food safety,
 * over-warning beats under-warning. Only deleted rows are excluded.
 */

/** Loose row shape so both generated Doc types and test fixtures fit. */
export type AllergenSourceRecord = {
  _id: string;
  deletedAt?: number | string | null;
  [key: string]: unknown;
};

export type DishAllergenInput = {
  dishIngredients: readonly AllergenSourceRecord[];
  dishComponents: readonly AllergenSourceRecord[];
  componentIngredients: readonly AllergenSourceRecord[];
  ingredients: readonly AllergenSourceRecord[];
};

export type DishAllergenReport = {
  /** Union of derived + declared allergens, in vocabulary order. */
  codes: CulinaryAllergenCode[];
  /** Contributing ingredient names (or "Declared on dish") per code. */
  sources: Map<CulinaryAllergenCode, string[]>;
  /** Recipe lines that resolved to an ingredient record. 0 = no recipe visible. */
  lineCount: number;
  /**
   * Live recipe lines whose ingredient record could not be found. Anything
   * above zero means the derivation is incomplete — never claim "no
   * allergens" while this is non-zero.
   */
  unresolvedCount: number;
};

const VOCAB_ORDER = new Map<string, number>(
  CULINARY_ALLERGENS.map((allergen, index) => [allergen.code, index]),
);

export function deriveDishAllergens(
  dish: AllergenSourceRecord,
  input: DishAllergenInput,
): DishAllergenReport {
  const sources = new Map<CulinaryAllergenCode, string[]>();
  const flag = (code: CulinaryAllergenCode, source: string) => {
    const list = sources.get(code) ?? [];
    if (!list.includes(source)) list.push(source);
    sources.set(code, list);
  };
  let lineCount = 0;
  let unresolvedCount = 0;

  const ingredientById = new Map(
    input.ingredients.map((row) => [row._id, row]),
  );
  const takeLine = (line: AllergenSourceRecord) => {
    // Prefer the ingredient the server hydrated onto the line: db.get
    // ignores soft-deletion, so a discontinued ingredient still referenced
    // by a live recipe line keeps contributing its allergens. The list
    // lookup is only a fallback (listIngredient omits discontinued rows).
    const hydrated = line.ingredient as AllergenSourceRecord | null | undefined;
    const ingredient =
      hydrated ?? ingredientById.get(String(line.ingredientId));
    if (!ingredient) {
      unresolvedCount += 1;
      return;
    }
    lineCount += 1;
    for (const code of (ingredient.allergens ?? []) as CulinaryAllergenCode[]) {
      flag(code, String(ingredient.name));
    }
  };

  for (const line of input.dishIngredients) {
    if (line.deletedAt != null || line.dishId !== dish._id) continue;
    takeLine(line);
  }

  const componentIds = new Set(
    input.dishComponents
      .filter((line) => line.deletedAt == null && line.dishId === dish._id)
      .map((line) => String(line.componentId)),
  );
  for (const line of input.componentIngredients) {
    if (line.deletedAt != null || !componentIds.has(String(line.componentId)))
      continue;
    takeLine(line);
  }

  for (const code of (dish.allergenSummary ?? []) as CulinaryAllergenCode[]) {
    flag(code, "Declared on dish");
  }

  const codes = [...sources.keys()].sort(
    (a, b) => (VOCAB_ORDER.get(a) ?? 99) - (VOCAB_ORDER.get(b) ?? 99),
  );
  return { codes, sources, lineCount, unresolvedCount };
}

export function allergenLabel(code: CulinaryAllergenCode): string {
  return (
    CULINARY_ALLERGENS.find((allergen) => allergen.code === code)?.label ??
    String(code)
  );
}
