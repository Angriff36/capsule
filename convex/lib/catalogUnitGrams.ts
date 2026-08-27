import { TypicalKitchenDensity } from "./typicalKitchenDensity";
import { VolumeMilliliters } from "./volumeUnitMl";

const GRAMS_PER_MASS_UNIT: Readonly<Record<string, number>> = {
  gram: 1,
  kilogram: 1000,
  ounce: 28.3495,
  pound: 453.592,
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

export type CatalogUnitGramHints = {
  servingGramsPerEach?: number;
  gramsPerMl?: number;
  foodName?: string;
};

export type CatalogGramBasis =
  | "mass"
  | "volume"
  | "serving"
  | "bottle_typical"
  | "household_cup"
  | "usda_basis";

export type CatalogGramResolution = {
  grams: number;
  basis: CatalogGramBasis;
};

/** Grams in one catalog unit for every Capsule stock unit. */
export class CatalogUnitGrams {
  static resolve(
    unit: string,
    hints: CatalogUnitGramHints = {},
  ): number | undefined {
    return CatalogUnitGrams.resolveDetailed(unit, hints)?.grams;
  }

  static resolveDetailed(
    unit: string,
    hints: CatalogUnitGramHints = {},
  ): CatalogGramResolution | undefined {
    const mass = GRAMS_PER_MASS_UNIT[unit];
    if (mass != null) return { grams: mass, basis: "mass" };

    const ml = VolumeMilliliters.millilitersFor(unit);
    if (ml != null) {
      const density = CatalogUnitGrams.density(hints);
      return { grams: ml * density, basis: "volume" };
    }

    if (!COUNT_UNITS.has(unit)) return undefined;

    if (hints.servingGramsPerEach != null && hints.servingGramsPerEach > 0) {
      return { grams: hints.servingGramsPerEach, basis: "serving" };
    }

    const density = CatalogUnitGrams.density(hints);
    if (unit === "bottle") {
      return { grams: TYPICAL_BOTTLE_ML * density, basis: "bottle_typical" };
    }

    const cupMl = VolumeMilliliters.millilitersFor("cup");
    if (hints.gramsPerMl != null && hints.gramsPerMl > 0 && cupMl != null) {
      return { grams: cupMl * hints.gramsPerMl, basis: "household_cup" };
    }

    return { grams: USDA_BASIS_GRAMS, basis: "usda_basis" };
  }

  private static density(hints: CatalogUnitGramHints): number {
    return (
      (hints.gramsPerMl != null && hints.gramsPerMl > 0
        ? hints.gramsPerMl
        : undefined) ??
      TypicalKitchenDensity.forName(hints.foodName) ??
      VolumeMilliliters.WATER_GRAMS_PER_ML
    );
  }
}
