/** US culinary milliliters for Capsule volume catalog units. */

export class VolumeMilliliters {
  static readonly WATER_GRAMS_PER_ML = 1;

  static readonly ML_PER_UNIT: Readonly<Record<string, number>> = {
    milliliter: 1,
    liter: 1000,
    teaspoon: 4.92892,
    tablespoon: 14.7868,
    cup: 236.588,
    pint: 473.176,
    quart: 946.353,
    gallon: 3785.41,
    fluid_ounce: 29.5735,
  };

  private static readonly TOKEN_TO_UNIT: ReadonlyArray<readonly [string, string]> =
    [
      ["fluid ounces", "fluid_ounce"],
      ["fluid ounce", "fluid_ounce"],
      ["fl. oz.", "fluid_ounce"],
      ["fl. oz", "fluid_ounce"],
      ["fl oz", "fluid_ounce"],
      ["floz", "fluid_ounce"],
      ["milliliters", "milliliter"],
      ["milliliter", "milliliter"],
      ["tablespoons", "tablespoon"],
      ["tablespoon", "tablespoon"],
      ["teaspoons", "teaspoon"],
      ["teaspoon", "teaspoon"],
      ["tbsp.", "tablespoon"],
      ["tbsp", "tablespoon"],
      ["tbs", "tablespoon"],
      ["tsp.", "teaspoon"],
      ["tsp", "teaspoon"],
      ["gallons", "gallon"],
      ["gallon", "gallon"],
      ["quarts", "quart"],
      ["quart", "quart"],
      ["pints", "pint"],
      ["pint", "pint"],
      ["liters", "liter"],
      ["liter", "liter"],
      ["cups", "cup"],
      ["cup", "cup"],
      ["gal", "gallon"],
      ["qts", "quart"],
      ["qt", "quart"],
      ["pts", "pint"],
      ["pt", "pint"],
      ["ml", "milliliter"],
      ["l", "liter"],
    ];

  static millilitersFor(unit: string): number | undefined {
    const ml = VolumeMilliliters.ML_PER_UNIT[unit];
    return ml != null && ml > 0 ? ml : undefined;
  }

  static isVolumeUnit(unit: string): boolean {
    return VolumeMilliliters.millilitersFor(unit) != null;
  }

  static parseUnitName(raw: string): string | undefined {
    const normalized = raw.trim().toLowerCase().replaceAll("×", " ");
    if (!normalized) return undefined;
    if (VolumeMilliliters.ML_PER_UNIT[normalized] != null) {
      return normalized;
    }
    for (const [token, unit] of VolumeMilliliters.TOKEN_TO_UNIT) {
      const pattern = new RegExp(
        `(^|[^a-z])${token.replaceAll(".", "\\.")}([^a-z]|$)`,
      );
      if (pattern.test(normalized)) return unit;
    }
    return undefined;
  }
}
