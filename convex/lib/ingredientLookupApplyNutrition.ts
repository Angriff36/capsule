import {
  CatalogUnitGrams,
  type CatalogGramBasis,
  type CatalogUnitGramHints,
} from "./catalogUnitGrams";
import { VolumeMilliliters } from "./volumeUnitMl";
import type { DensitySource } from "./foodDensityFromLookup";
import {
  mergeScaledNutritionWithExisting,
  scaleNutritionFromGramsToUnit,
  type ScaledNutrition,
} from "./nutritionUnitScaler";

export function gramsForLookupCatalogUnit(
  unit: string,
  hints: CatalogUnitGramHints,
): number | undefined {
  return CatalogUnitGrams.resolve(unit, hints);
}

export function resolveLookupCatalogGrams(
  unit: string,
  hints: CatalogUnitGramHints,
) {
  return CatalogUnitGrams.resolveDetailed(unit, hints);
}

export function scaleLookupNutrition(
  nutrition: ScaledNutrition,
  unit: string,
  gramsPerCatalogUnit?: number,
): ScaledNutrition | null {
  return scaleNutritionFromGramsToUnit(nutrition, unit, gramsPerCatalogUnit);
}

export function mergeLookupNutrition(
  existing: Record<string, unknown>,
  scaled: ScaledNutrition,
): ScaledNutrition {
  return mergeScaledNutritionWithExisting(existing, scaled);
}

export function nutritionSkippedReason(unit: string): string {
  if (VolumeMilliliters.isVolumeUnit(unit)) {
    return `Nutrition was not saved — unit "${unit}" could not be scaled from the lookup. Enter nutrition manually.`;
  }
  if (unit === "each") {
    return `Nutrition was not saved — unit "${unit}" needs a label serving size from the lookup, or switch to a weight or volume unit.`;
  }
  return `Nutrition was not saved — unit "${unit}" cannot be scaled from per-gram lookup values. Switch to a weight or volume unit, or enter nutrition manually.`;
}

export function nutritionAppliedNote(
  unit: string,
  source?: DensitySource,
  basis?: CatalogGramBasis,
): string {
  if (basis === "bottle_typical") {
    return `Nutrition saved per ${unit} using a typical 750 ml bottle — verify the actual bottle size.`;
  }
  if (basis === "household_cup") {
    return `Nutrition saved per ${unit} using one cup from the food database household measure — verify the pack size.`;
  }
  if (basis === "usda_basis") {
    return `Nutrition saved per ${unit} using a 100 g reference amount — verify the actual piece or pack weight.`;
  }
  if (source === "typical") {
    return `Nutrition saved per ${unit} using typical kitchen density for this item — verify if the pack is much thicker or thinner than usual.`;
  }
  if (source === "water") {
    return `Nutrition saved per ${unit} using a water-like density — verify oils, flours, and similar items.`;
  }
  return `Nutrition saved per ${unit}.`;
}
