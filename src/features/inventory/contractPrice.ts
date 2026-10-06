type Contract = {
  _id: string;
  vendorId: string;
  status: string;
  startsAt?: number | null;
  endsAt?: number | null;
  deletedAt?: number | null;
};
type Tier = {
  contractId: string;
  itemName: string;
  unit: string;
  minQuantity: number;
  unitPrice: number;
  deletedAt?: number | null;
};

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The agreed price for one item from this vendor's active contract: the
 * tier for the same item and unit with the highest minimum the quantity
 * reaches. Null when no active contract covers it.
 */
export function contractPrice(
  contracts: readonly Contract[],
  tiers: readonly Tier[],
  match: {
    vendorId: string;
    itemName: string;
    unit: string;
    quantity: number;
    at?: number;
  },
): number | null {
  const at = match.at ?? Date.now();
  const live = new Set(
    contracts
      .filter(
        (c) =>
          c.deletedAt == null &&
          c.status === "active" &&
          c.vendorId === match.vendorId &&
          (c.startsAt == null || Number(c.startsAt) <= at) &&
          (c.endsAt == null || Number(c.endsAt) >= at),
      )
      .map((c) => c._id),
  );
  const best = tiers
    .filter(
      (t) =>
        t.deletedAt == null &&
        live.has(t.contractId) &&
        same(t.itemName, match.itemName) &&
        same(t.unit, match.unit) &&
        Number(t.minQuantity) <= match.quantity,
    )
    .sort((a, b) => Number(b.minQuantity) - Number(a.minQuantity))[0];
  return best ? Number(best.unitPrice) : null;
}
