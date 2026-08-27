import { HouseholdVolumeParser } from "./householdVolumeParse";
import { TypicalKitchenDensity } from "./typicalKitchenDensity";
import { VolumeMilliliters } from "./volumeUnitMl";

export type FdcFoodPortion = {
  amount?: number;
  gramWeight?: number;
  modifier?: string | null;
  measureUnit?: {
    name?: string | null;
    abbreviation?: string | null;
  } | null;
};

export type DensitySource =
  | "usda_portion"
  | "label_household"
  | "typical"
  | "water";

export type LookupDensity = {
  gramsPerMl: number;
  source: DensitySource;
};

export type LookupDensityInput = {
  foodPortions?: readonly FdcFoodPortion[] | null;
  servingGrams?: number;
  householdServingText?: string | null;
  productName?: string | null;
};

/** Resolve grams per milliliter from USDA portions, label text, or typical density. */
export class LookupFoodDensity {
  private readonly household = new HouseholdVolumeParser();

  resolve(input: LookupDensityInput): LookupDensity | undefined {
    const fromPortions = this.fromFoodPortions(input.foodPortions);
    if (fromPortions) {
      return { gramsPerMl: fromPortions, source: "usda_portion" };
    }
    const fromLabel = this.fromHouseholdServing(
      input.servingGrams,
      input.householdServingText,
    );
    if (fromLabel) {
      return { gramsPerMl: fromLabel, source: "label_household" };
    }
    const typical = TypicalKitchenDensity.forName(input.productName);
    if (typical != null && typical > 0) {
      return { gramsPerMl: typical, source: "typical" };
    }
    return undefined;
  }

  resolveWithVolumeFallback(input: LookupDensityInput): LookupDensity {
    return (
      this.resolve(input) ?? {
        gramsPerMl: VolumeMilliliters.WATER_GRAMS_PER_ML,
        source: "water",
      }
    );
  }

  private fromFoodPortions(
    portions?: readonly FdcFoodPortion[] | null,
  ): number | undefined {
    if (!portions?.length) return undefined;
    const densities: Array<{ gramsPerMl: number; preferCup: boolean }> = [];
    for (const portion of portions) {
      const gramsPerMl = LookupFoodDensity.portionGramsPerMl(portion);
      if (gramsPerMl == null) continue;
      const label = LookupFoodDensity.portionLabel(portion);
      densities.push({
        gramsPerMl,
        preferCup: VolumeMilliliters.parseUnitName(label) === "cup",
      });
    }
    if (densities.length === 0) return undefined;
    const cup = densities.find((row) => row.preferCup);
    return (cup ?? densities[0]).gramsPerMl;
  }

  private fromHouseholdServing(
    servingGrams?: number,
    householdText?: string | null,
  ): number | undefined {
    if (servingGrams == null || servingGrams <= 0) return undefined;
    const measure = this.household.parse(householdText);
    if (!measure) return undefined;
    const mlEach = VolumeMilliliters.millilitersFor(measure.volumeUnit);
    if (mlEach == null) return undefined;
    const ml = mlEach * measure.quantity;
    if (!Number.isFinite(ml) || ml <= 0) return undefined;
    return servingGrams / ml;
  }

  private static portionLabel(portion: FdcFoodPortion): string {
    return [
      portion.measureUnit?.name,
      portion.measureUnit?.abbreviation,
      portion.modifier,
    ]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(" ");
  }

  private static portionGramsPerMl(
    portion: FdcFoodPortion,
  ): number | undefined {
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
    const unit = VolumeMilliliters.parseUnitName(
      LookupFoodDensity.portionLabel(portion),
    );
    const mlEach = unit ? VolumeMilliliters.millilitersFor(unit) : undefined;
    if (mlEach == null) return undefined;
    return gramWeight / (amount * mlEach);
  }
}
