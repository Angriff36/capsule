import { useAction } from "convex/react";
import { api } from "./api";

/** Authored seam for ingredient food-database lookup Convex actions. */
export function useIngredientLookupSearchFoods() {
  return useAction(api.ingredientLookup.searchFoods);
}

export function useIngredientLookupGetFoodAutofill() {
  return useAction(api.ingredientLookup.getFoodAutofill);
}

export function useIngredientLookupApplyToIngredient() {
  return useAction(api.ingredientLookup.applyToIngredient);
}
