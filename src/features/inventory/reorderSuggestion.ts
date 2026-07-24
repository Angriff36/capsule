// Smart reorder suggestion: blends the event's IngredientDemand requirement
// with the standing par-level shortfall, then adds a buffer sized from how
// volatile that ingredient's historical demand has been. Volatile demand →
// order a little extra to avoid stockouts; steady demand → no padding, so we
// don't over-purchase.

const toNum = (value: number | string): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

// Cap the variance buffer so a wildly inconsistent history can't balloon the
// order. ponytail: 50% ceiling, revisit if operators want a per-tenant knob.
const BUFFER_CAP = 0.5;

type DemandLike = {
  ingredientId: string;
  unit: string;
  requiredQuantity: number | string;
  deletedAt?: number | null;
};

type InventoryItemLike = {
  ingredientId: string;
  unit: string;
  parLevel: number | string;
  quantityOnHand: number | string;
  deletedAt?: number | null;
};

type NeedLike = {
  ingredientId: string;
  unit: string;
  requiredQuantity: number | string;
};

export type ReorderSuggestion = {
  demand: number;
  parShortfall: number;
  bufferFraction: number;
  suggestedQuantity: number;
};

// Coefficient of variation (stddev / mean) of this ingredient's historical
// per-line demand at the same unit. Returns 0 with fewer than two data points —
// one event is not enough signal to justify padding an order.
export function demandVariance(
  demands: DemandLike[],
  ingredientId: string,
  unit: string,
): number {
  const values = demands
    .filter(
      (d) =>
        d.deletedAt == null &&
        d.ingredientId === ingredientId &&
        d.unit === unit,
    )
    .map((d) => toNum(d.requiredQuantity))
    .filter((v) => v > 0);
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.min(cv, BUFFER_CAP);
}

export function suggestOrderQuantity(
  need: NeedLike,
  inventoryItems: InventoryItemLike[],
  demands: DemandLike[],
): ReorderSuggestion {
  const demand = Math.max(0, toNum(need.requiredQuantity));
  // Top-up needed to restore par after the event consumes stock, summed across
  // every stock line for this ingredient at the matching unit.
  const parShortfall = inventoryItems.reduce((sum, item) => {
    if (item.deletedAt != null) return sum;
    if (item.ingredientId !== need.ingredientId) return sum;
    if (item.unit !== need.unit) return sum;
    return sum + Math.max(0, toNum(item.parLevel) - toNum(item.quantityOnHand));
  }, 0);
  const bufferFraction = demandVariance(demands, need.ingredientId, need.unit);
  // Buffer only pads the demand portion (par is already a fixed target).
  const raw = demand * (1 + bufferFraction) + parShortfall;
  const suggestedQuantity = Math.ceil(raw * 100) / 100;
  return { demand, parShortfall, bufferFraction, suggestedQuantity };
}
