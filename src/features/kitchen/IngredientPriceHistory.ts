export type PriceDateValue = number | string | Date | null | undefined;

export interface IngredientPriceObservationInput {
  _id: string;
  ingredientId: string;
  vendorId: string;
  vendorOrderId: string;
  vendorOrderLineId: string;
  receiptQuantity: number | string;
  cumulativeReceivedQuantity: number | string;
  unit: string;
  unitPrice: number | string;
  observedAt?: PriceDateValue;
  createdAt?: PriceDateValue;
  deletedAt?: PriceDateValue;
}

export interface IngredientCatalogPriceInput {
  id: string;
  unit: string;
  costPerUnit: number | string;
}

function timestamp(value: PriceDateValue): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function observationTime(
  observation: IngredientPriceObservationInput,
): number {
  return timestamp(observation.observedAt ?? observation.createdAt);
}

export function sortPriceObservations(
  observations: IngredientPriceObservationInput[],
): IngredientPriceObservationInput[] {
  return observations
    .filter((observation) => observation.deletedAt == null)
    .slice()
    .sort(
      (left, right) =>
        observationTime(right) - observationTime(left) ||
        right._id.localeCompare(left._id),
    );
}

export function latestPriceByIngredient(
  observations: IngredientPriceObservationInput[],
): Map<string, IngredientPriceObservationInput> {
  const latest = new Map<string, IngredientPriceObservationInput>();
  for (const observation of sortPriceObservations(observations)) {
    if (!latest.has(observation.ingredientId)) {
      latest.set(observation.ingredientId, observation);
    }
  }
  return latest;
}

export function latestPriceByVendor(
  observations: IngredientPriceObservationInput[],
): Map<string, IngredientPriceObservationInput> {
  const latest = new Map<string, IngredientPriceObservationInput>();
  for (const observation of sortPriceObservations(observations)) {
    if (!latest.has(observation.vendorId)) {
      latest.set(observation.vendorId, observation);
    }
  }
  return latest;
}

export function resolveIngredientPrice(
  ingredient: IngredientCatalogPriceInput,
  latestObservation?: IngredientPriceObservationInput,
): { unit: string; costPerUnit: number; source: "receipt" | "catalog" } {
  if (latestObservation) {
    return {
      unit: latestObservation.unit,
      costPerUnit: Number(latestObservation.unitPrice),
      source: "receipt",
    };
  }

  return {
    unit: ingredient.unit,
    costPerUnit: Number(ingredient.costPerUnit),
    source: "catalog",
  };
}

export function priceChange(
  observations: IngredientPriceObservationInput[],
): { amount: number; percent: number | null } | null {
  const sorted = sortPriceObservations(observations);
  if (sorted.length < 2) return null;
  const current = Number(sorted[0]!.unitPrice);
  const previous = Number(sorted[1]!.unitPrice);
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return {
    amount: current - previous,
    percent: previous === 0 ? null : ((current - previous) / previous) * 100,
  };
}
