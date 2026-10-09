/**
 * What the cook typed when finishing a batch, turned into the complete
 * command's arguments. The counted yield is required and may be zero; waste
 * is optional, and a wasted amount needs a reason.
 */
export type BatchCompletionEntry = {
  yield?: string;
  waste?: string;
  wasteReason?: string;
};

export type BatchCompletionArgs = {
  actualYield: number;
  wasteQuantity?: number;
  wasteReason?: string;
};

function amount(text: string | undefined): number | null {
  if (text == null || text.trim() === "") return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : Number.NaN;
}

export function batchCompletionArgs(
  entry: BatchCompletionEntry | undefined,
): BatchCompletionArgs {
  const actualYield = amount(entry?.yield);
  if (actualYield == null) throw new Error("Enter the actual batch yield.");
  if (Number.isNaN(actualYield) || actualYield < 0)
    throw new Error("The batch yield can't be negative. Use zero or more.");
  const waste = amount(entry?.waste);
  if (waste == null || waste === 0) return { actualYield };
  if (Number.isNaN(waste) || waste < 0)
    throw new Error("The wasted amount can't be negative. Use zero or more.");
  const wasteReason = entry?.wasteReason?.trim();
  if (!wasteReason) throw new Error("Say why the food was wasted.");
  return { actualYield, wasteQuantity: waste, wasteReason };
}

/** "Short by 5 portion" or null when the batch met its plan. */
export function batchShortfallLabel(
  shortfall: number | null | undefined,
  unit: string,
): string | null {
  const value = Number(shortfall ?? 0);
  if (!(value > 0)) return null;
  return `Short by ${Math.round(value * 100) / 100} ${unit}`;
}
