export type SuspectQuantityInput = {
  name: string;
  unit: string;
  quantity: number;
  servings?: number;
};

/**
 * Keep TPP numbers even when they look wrong. Flag sliced radish at
 * ~2 lb/guest (196 lb for 98) instead of silently converting the unit.
 */
export function suspectPrepQuantityFlag(
  input: SuspectQuantityInput,
): string | null {
  const name = String(input.name ?? "").toLowerCase();
  const unit = String(input.unit ?? "").toLowerCase();
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const servings = Number(input.servings);
  const perGuest =
    Number.isFinite(servings) && servings > 0 ? quantity / servings : quantity;
  const isRadish = name.includes("radish");
  const isPound = unit === "pound" || unit === "lb" || unit === "lbs";
  if (isRadish && isPound && perGuest >= 1) {
    return `TPP unit looks wrong: ${quantity} ${input.unit} of ${input.name} (~${perGuest.toFixed(2)} per guest). The number is kept; it is not converted.`;
  }
  return null;
}
