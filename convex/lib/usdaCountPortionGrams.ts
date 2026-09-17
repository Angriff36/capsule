import type { FdcFoodPortion } from "./foodDensityFromLookup";
import { VolumeMilliliters } from "./volumeUnitMl";

/**
 * Picks a grams-per-EACH weight from USDA food portions.
 *
 * USDA Foundation / SR Legacy records list portions such as "1 cup, chopped
 * (128 g)", "1 medium (182 g)" and "1 tbsp (15 g)" side by side. Only the
 * portions that describe a countable unit (each, piece, slice, medium, ...)
 * may stand in for a stock count; volumetric portions belong to density
 * conversion and mass portions are already grams. Issue #248: applying a cup
 * weight to "each" stored the wrong nutrition for every count-unit ingredient.
 */
export class UsdaCountPortionWeight {
  private static readonly COUNT_TOKENS = [
    "each",
    "piece",
    "pieces",
    "pc",
    "unit",
    "units",
    "item",
    "items",
    "whole",
    "slice",
    "slices",
    "serving",
    "servings",
    "nlea serving",
    "small",
    "medium",
    "large",
    "extra large",
    "jumbo",
    "patty",
    "patties",
    "link",
    "links",
    "fillet",
    "filet",
    "egg",
    "clove",
    "head",
    "stalk",
    "stalks",
    "leaf",
    "leaves",
    "sprig",
    "wedge",
    "stick",
    "ear",
    "pod",
    "bunch",
    "fruit",
    "breast",
    "thigh",
    "drumstick",
    "wing",
    "steak",
    "chop",
    "cookie",
    "bar",
    "muffin",
    "roll",
    "bagel",
    "tortilla",
    "waffle",
    "pancake",
  ];

  private static readonly MASS_PATTERN =
    /(^|[^a-z])(g|gram|grams|oz|ounce|ounces|lb|lbs|pound|pounds|kg|kilogram|kilograms|mg)([^a-z]|$)/;

  gramsPerEach(
    portions?: readonly FdcFoodPortion[] | null,
  ): number | undefined {
    if (!portions?.length) return undefined;
    for (const portion of portions) {
      const grams = UsdaCountPortionWeight.gramsPerAmount(portion);
      if (grams == null) continue;
      if (UsdaCountPortionWeight.isCountPortion(portion)) return grams;
    }
    return undefined;
  }

  static isCountPortion(portion: FdcFoodPortion): boolean {
    const label = UsdaCountPortionWeight.label(portion);
    if (!label) return false;
    if (VolumeMilliliters.parseUnitName(label) != null) return false;
    if (UsdaCountPortionWeight.MASS_PATTERN.test(label)) return false;
    return UsdaCountPortionWeight.COUNT_TOKENS.some((token) =>
      new RegExp(`(^|[^a-z])${token}([^a-z]|$)`).test(label),
    );
  }

  private static label(portion: FdcFoodPortion): string {
    return [
      portion.measureUnit?.name,
      portion.measureUnit?.abbreviation,
      portion.modifier,
    ]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ")
      .trim()
      .toLowerCase();
  }

  private static gramsPerAmount(portion: FdcFoodPortion): number | undefined {
    const amount = portion.amount;
    const gramWeight = portion.gramWeight;
    if (
      amount == null ||
      gramWeight == null ||
      !Number.isFinite(amount) ||
      !Number.isFinite(gramWeight) ||
      amount <= 0 ||
      gramWeight <= 0
    ) {
      return undefined;
    }
    return gramWeight / amount;
  }
}
