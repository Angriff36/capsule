/** Exact US customary ratios; never infer density or a count/batch size.
 * Keep the dimensional factors in PrepTask.reconcileRemainingWork in step with this table.
 */
const units: Record<string, readonly [string, number]> = {
  gram: ["mass", 1],
  kilogram: ["mass", 1000],
  ounce: ["mass", 28.349523125],
  pound: ["mass", 453.59237],
  milliliter: ["volume", 1],
  liter: ["volume", 1000],
  teaspoon: ["volume", 4.92892159375],
  tablespoon: ["volume", 14.78676478125],
  cup: ["volume", 236.5882365],
  pint: ["volume", 473.176473],
  quart: ["volume", 946.352946],
  gallon: ["volume", 3785.411784],
};

export function recipeUnitRatio(from: string, to: string): number | null {
  if (from === to) return 1;
  const source = units[from];
  const target = units[to];
  return source && target && source[0] === target[0]
    ? source[1] / target[1]
    : null;
}
