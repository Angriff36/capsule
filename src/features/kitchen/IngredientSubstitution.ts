export type SubstitutionIngredient = {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
  allergens: readonly string[];
  status: string;
  substituteIngredientIds?: readonly string[] | null;
  deletedAt?: number | null;
};

export type SubstitutionInventoryItem = {
  id: string;
  ingredientId: string;
  quantityOnHand: number;
  unit: string;
  stockedAt?: number | null;
  deletedAt?: number | null;
};

export type SubstitutionReservation = {
  inventoryItemId: string;
  quantity: number;
  status: string;
  deletedAt?: number | null;
};

export type RankedIngredientSubstitution = {
  ingredientId: string;
  name: string;
  unit: string;
  availableQuantity: number;
  coverageQuantity: number;
  costDelta: number;
  newAllergens: string[];
  allergenCompatible: boolean;
};

function availableQuantity(
  ingredientId: string,
  unit: string,
  inventoryItems: readonly SubstitutionInventoryItem[],
  reservations: readonly SubstitutionReservation[],
) {
  return inventoryItems
    .filter(
      (item) =>
        item.ingredientId === ingredientId &&
        item.unit === unit &&
        item.stockedAt != null &&
        item.deletedAt == null,
    )
    .reduce((total, item) => {
      const reserved = reservations
        .filter(
          (reservation) =>
            reservation.inventoryItemId === item.id &&
            reservation.status === "active" &&
            reservation.deletedAt == null,
        )
        .reduce((sum, reservation) => sum + reservation.quantity, 0);
      return total + Math.max(0, item.quantityOnHand - reserved);
    }, 0);
}

/**
 * Finds configured, in-stock alternatives for one shortage. Candidates that
 * introduce no allergens rank first; lower unit-cost deltas break ties.
 */
export function rankIngredientSubstitutions(input: {
  sourceIngredientId: string;
  shortageQuantity: number;
  shortageUnit: string;
  ingredients: readonly SubstitutionIngredient[];
  inventoryItems: readonly SubstitutionInventoryItem[];
  reservations: readonly SubstitutionReservation[];
}): RankedIngredientSubstitution[] {
  const source = input.ingredients.find(
    (ingredient) => ingredient.id === input.sourceIngredientId,
  );
  if (!source) return [];

  const sourceAllergens = new Set(source.allergens);
  return (source.substituteIngredientIds ?? [])
    .map((candidateId) =>
      input.ingredients.find((ingredient) => ingredient.id === candidateId),
    )
    .filter(
      (candidate): candidate is SubstitutionIngredient =>
        candidate != null &&
        candidate.id !== source.id &&
        candidate.deletedAt == null &&
        candidate.status === "active" &&
        candidate.unit === input.shortageUnit,
    )
    .map((candidate) => {
      const available = availableQuantity(
        candidate.id,
        input.shortageUnit,
        input.inventoryItems,
        input.reservations,
      );
      const newAllergens = candidate.allergens.filter(
        (allergen) => !sourceAllergens.has(allergen),
      );
      return {
        ingredientId: candidate.id,
        name: candidate.name,
        unit: candidate.unit,
        availableQuantity: available,
        coverageQuantity: Math.min(input.shortageQuantity, available),
        costDelta: candidate.costPerUnit - source.costPerUnit,
        newAllergens,
        allergenCompatible: newAllergens.length === 0,
      };
    })
    .filter((candidate) => candidate.availableQuantity > 0)
    .sort(
      (left, right) =>
        Number(right.allergenCompatible) - Number(left.allergenCompatible) ||
        left.newAllergens.length - right.newAllergens.length ||
        left.costDelta - right.costDelta ||
        left.name.localeCompare(right.name),
    );
}
