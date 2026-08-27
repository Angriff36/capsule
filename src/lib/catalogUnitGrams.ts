/** Client mirror of convex/lib/catalogUnitGrams — keep both in step. */

const GRAMS_PER_MASS_UNIT: Readonly<Record<string, number>> = {
  gram: 1,
  kilogram: 1000,
  ounce: 28.3495,
  pound: 453.592,
};

const ML_PER_UNIT: Readonly<Record<string, number>> = {
  milliliter: 1,
  liter: 1000,
  teaspoon: 4.92892,
  tablespoon: 14.7868,
  cup: 236.588,
  pint: 473.176,
  quart: 946.353,
  gallon: 3785.41,
};

const COUNT_UNITS = new Set([
  "each",
  "portion",
  "serving",
  "batch",
  "melon",
  "bottle",
]);

const TYPICAL_BOTTLE_ML = 750;
const USDA_BASIS_GRAMS = 100;
const WATER_GRAMS_PER_ML = 1;

const TYPICAL_DENSITY: ReadonlyArray<{ test: RegExp; gramsPerMl: number }> = [
  { test: /\b(olive oil|vegetable oil|canola|oil)\b/i, gramsPerMl: 0.91 },
  { test: /\b(honey|syrup|molasses)\b/i, gramsPerMl: 1.4 },
  { test: /\b(flour)\b/i, gramsPerMl: 0.53 },
  { test: /\b(sugar)\b/i, gramsPerMl: 0.85 },
  { test: /\b(rice)\b/i, gramsPerMl: 0.78 },
  {
    test: /\b(black beans?|kidney beans?|pinto beans?|garbanzo|chickpeas?|lentils?|beans?)\b/i,
    gramsPerMl: 0.73,
  },
  { test: /\b(milk|cream|half[-\s]?and[-\s]?half)\b/i, gramsPerMl: 1.03 },
  { test: /\b(tomato|salsa|sauce)\b/i, gramsPerMl: 1.04 },
  { test: /\b(water|broth|stock|juice|vinegar|wine)\b/i, gramsPerMl: 1 },
];

export type CatalogUnitGramHints = {
  servingGramsPerEach?: number;
  gramsPerMl?: number;
  foodName?: string;
};

export class CatalogUnitGrams {
  static resolve(
    unit: string,
    hints: CatalogUnitGramHints = {},
  ): number | undefined {
    const mass = GRAMS_PER_MASS_UNIT[unit];
    if (mass != null) return mass;

    const ml = ML_PER_UNIT[unit];
    if (ml != null) {
      return ml * CatalogUnitGrams.density(hints);
    }

    if (!COUNT_UNITS.has(unit)) return undefined;

    if (hints.servingGramsPerEach != null && hints.servingGramsPerEach > 0) {
      return hints.servingGramsPerEach;
    }

    const density = CatalogUnitGrams.density(hints);
    if (unit === "bottle") return TYPICAL_BOTTLE_ML * density;
    if (hints.gramsPerMl != null && hints.gramsPerMl > 0) {
      return ML_PER_UNIT.cup * hints.gramsPerMl;
    }
    return USDA_BASIS_GRAMS;
  }

  static canScale(unit: string): boolean {
    return (
      CatalogUnitGrams.resolve(unit, { gramsPerMl: WATER_GRAMS_PER_ML }) != null
    );
  }

  private static density(hints: CatalogUnitGramHints): number {
    if (hints.gramsPerMl != null && hints.gramsPerMl > 0) {
      return hints.gramsPerMl;
    }
    if (hints.foodName) {
      for (const row of TYPICAL_DENSITY) {
        if (row.test.test(hints.foodName)) return row.gramsPerMl;
      }
    }
    return WATER_GRAMS_PER_ML;
  }
}
