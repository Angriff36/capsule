// AUTHOR SEAM - the price history of one vendor item, read from its events
// (the item keeps only its current price). Shared by the price history read
// and the price list import, so a dated price already on file is seen the
// same way by both.

export type VendorItemPricePoint = {
  vendorItemId: string;
  packPrice: number;
  packQuantity: number;
  packUnit: string;
  pricedAt: number;
};

type ItemFields = {
  _id: string;
  packPrice?: number | null;
  packQuantity: number;
  packUnit: string;
  priceSetAt?: number | null;
  addedAt?: number | null;
  _creationTime: number;
};

type EventRow = { type: string; payload: unknown; createdAt: number };

type Payload = {
  packPrice?: number | null;
  previousPackPrice?: number | null;
  packQuantity?: number;
  packUnit?: string;
  priceDate?: number | null;
};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Every price the item has had, newest first, one point per price and date.
 * Items added before prices carried their event fields fall back to the
 * price before their first change (dated when the item was added) and the
 * current price.
 */
export function vendorItemPriceHistory(
  item: ItemFields,
  events: readonly EventRow[],
): VendorItemPricePoint[] {
  const points: VendorItemPricePoint[] = [];
  const point = (
    packPrice: number | null,
    pricedAt: number,
    payload: Payload,
  ) => {
    if (packPrice == null) return;
    points.push({
      vendorItemId: item._id,
      packPrice,
      packQuantity: num(payload.packQuantity) ?? Number(item.packQuantity),
      packUnit:
        typeof payload.packUnit === "string" ? payload.packUnit : item.packUnit,
      pricedAt,
    });
  };
  let firstPriceSeen = false;
  const sorted = [...events].sort((a, b) => a.createdAt - b.createdAt);
  for (const row of sorted) {
    const payload = (row.payload ?? {}) as Payload;
    const pricedAt = num(payload.priceDate) ?? row.createdAt;
    if (row.type === "VendorItemAdded") {
      if (num(payload.packPrice) != null) firstPriceSeen = true;
      point(num(payload.packPrice), pricedAt, payload);
    } else if (row.type === "VendorItemUpdated") {
      const price = num(payload.packPrice);
      const previous = num(payload.previousPackPrice);
      if (price === previous) continue;
      if (!firstPriceSeen && previous != null) {
        point(previous, item.addedAt ?? item._creationTime, {});
      }
      firstPriceSeen = true;
      point(price, pricedAt, payload);
    } else if (row.type === "VendorItemPastPriceRecorded") {
      point(num(payload.packPrice), pricedAt, payload);
    }
  }
  if (!firstPriceSeen) {
    point(
      num(item.packPrice),
      item.priceSetAt ?? item.addedAt ?? item._creationTime,
      {},
    );
  }
  const seen = new Set<string>();
  return points
    .sort((a, b) => b.pricedAt - a.pricedAt)
    .filter((p) => {
      const key = `${p.pricedAt}:${p.packPrice}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** True when this price on this date is already in the item's history. */
export function hasPricePoint(
  history: readonly VendorItemPricePoint[],
  packPrice: number,
  pricedAt: number,
): boolean {
  return history.some(
    (p) => p.packPrice === packPrice && p.pricedAt === pricedAt,
  );
}
