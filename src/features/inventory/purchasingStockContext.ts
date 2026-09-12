type StockItem = {
  ingredientId: string;
  unit: string;
  quantityOnHand: number | string;
  totalReserved?: number | string | null;
  deletedAt?: number | null;
  removedAt?: number | null;
  useByAt?: number | null;
};

export type PurchasingStockContext = {
  onHand: number | null;
  reserved: number | null;
  pastUseBy: number | null;
};

const quantity = (value: number | string | null | undefined) => {
  if (value == null || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

// These are shared stock facts, not an allocation to this event or an order
// recommendation. Different event sizes are not evidence for a buying buffer.
export function purchasingStockContext(
  need: { ingredientId: string; unit: string },
  inventory: readonly StockItem[] | undefined,
  now: number,
): PurchasingStockContext | undefined {
  if (inventory === undefined) return undefined;
  const matching = inventory.filter(
    (item) =>
      item.deletedAt == null &&
      item.removedAt == null &&
      item.ingredientId === need.ingredientId &&
      item.unit === need.unit,
  );
  const sum = (values: (number | null)[]) =>
    values.some((value) => value === null)
      ? null
      : values.reduce<number>((total, value) => total + value!, 0);
  return {
    onHand: sum(matching.map((item) => quantity(item.quantityOnHand))),
    reserved: sum(matching.map((item) => quantity(item.totalReserved))),
    pastUseBy: sum(
      matching
        .filter((item) => item.useByAt != null && item.useByAt <= now)
        .map((item) => quantity(item.quantityOnHand)),
    ),
  };
}
