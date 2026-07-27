/**
 * How a prep quantity is written on a cook's sheet.
 *
 * Prep quantities are stored per-guest-exact, so a template of 0.01 melon at 55
 * guests stores 0.55. That is the right number to keep — but nobody balls half
 * a watermelon, so units you can only handle whole round up on the sheet.
 * Weights and volumes stay exact, and `batch` stays exact too because the real
 * sheets do ask for "0.75 batch".
 *
 * Storage is untouched: prep quantity is an instruction to a cook, not a
 * costing input (cost comes from ComponentIngredient via EventIngredientContribution).
 */
const WHOLE_UNITS = new Set(["each", "melon", "bottle"]);

export function prepQuantityLabel(
  quantity: number,
  unit: string | undefined,
): string {
  const value = WHOLE_UNITS.has(String(unit)) ? Math.ceil(quantity) : quantity;
  // Trim float noise like 342.65000000000003 without touching short decimals.
  return String(Number(value.toFixed(4)));
}
