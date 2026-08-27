/** Typical g/ml for common kitchen items when a label measure is missing. */

export class TypicalKitchenDensity {
  private static readonly ROWS: ReadonlyArray<{
    test: RegExp;
    gramsPerMl: number;
  }> = [
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
    {
      test: /\b(water|broth|stock|juice|vinegar|wine)\b/i,
      gramsPerMl: 1,
    },
  ];

  static forName(name?: string | null): number | undefined {
    if (!name?.trim()) return undefined;
    for (const row of TypicalKitchenDensity.ROWS) {
      if (row.test.test(name)) return row.gramsPerMl;
    }
    return undefined;
  }
}
