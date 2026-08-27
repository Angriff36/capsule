import type { IngredientNutritionFields } from "../ComponentNutrition";
import type { CulinaryAllergenCode } from "../CulinaryAllergenVocabulary";
import type { UnitOfMeasure } from "../import/UnitOfMeasureMapper";

export type IngredientLookupSource = "usda_fdc" | "open_food_facts";

/** Normalized autofill payload from `ingredientLookup.getFoodAutofill`. */
export type IngredientLookupApplyResult = {
  nutritionApplied: boolean;
  nutritionSkippedReason?: string;
  imageApplied?: boolean;
};

export type IngredientAutofillProfile = {
  source: IngredientLookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
  unit: UnitOfMeasure;
  allergens: CulinaryAllergenCode[];
  isGlutenFree: boolean;
  nutrition: Partial<IngredientNutritionFields>;
  nutritionNote: string;
  allergenNote: string;
  sourceLabel: string;
  imageUrl?: string;
  imageNote: string;
};

export type IngredientLookupHit = {
  source: IngredientLookupSource;
  externalId: string;
  name: string;
  category?: string;
  brandOwner?: string;
};
