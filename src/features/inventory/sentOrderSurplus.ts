/**
 * BE-10.5: a sent order is never rewritten when an event later needs less.
 * Instead the buyer sees each event share that is now more than needed, while
 * the order can still be changed with the vendor (sent, confirmed, or partly
 * received). Once everything has arrived, the extra is simply stock.
 */
export type SurplusNeed = {
  _id: string;
  eventId: string;
  ingredientId: string;
  unit: string;
  status: string;
  requiredQuantity: number;
  orderedQuantity?: number | null;
  vendorOrderId?: string | null;
  deletedAt?: unknown;
};

export type SurplusOrder = { _id: string; status: string; deletedAt?: unknown };

export type SentOrderSurplus = {
  needId: string;
  eventId: string;
  ingredientId: string;
  vendorOrderId: string;
  unit: string;
  orderedFor: number;
  nowNeeded: number;
  extra: number;
  eventCancelled: boolean;
};

const CHANGEABLE_SENT = new Set([
  "submitted",
  "confirmed",
  "partially_received",
]);

export function sentOrderSurplus(input: {
  needs: readonly SurplusNeed[];
  orders: readonly SurplusOrder[];
}): SentOrderSurplus[] {
  const orders = new Map(
    input.orders.map((order) => [String(order._id), order]),
  );
  const rows: SentOrderSurplus[] = [];
  for (const need of input.needs) {
    if (need.deletedAt != null || need.orderedQuantity == null) continue;
    if (!need.vendorOrderId) continue;
    const order = orders.get(String(need.vendorOrderId));
    if (!order || order.deletedAt != null) continue;
    if (!CHANGEABLE_SENT.has(String(order.status))) continue;
    const cancelled = need.status === "cancelled";
    const nowNeeded = cancelled ? 0 : Number(need.requiredQuantity);
    const orderedFor = Number(need.orderedQuantity);
    const extra = Math.round((orderedFor - nowNeeded) * 10000) / 10000;
    if (extra <= 0) continue;
    rows.push({
      needId: String(need._id),
      eventId: String(need.eventId),
      ingredientId: String(need.ingredientId),
      vendorOrderId: String(need.vendorOrderId),
      unit: need.unit,
      orderedFor,
      nowNeeded,
      extra,
      eventCancelled: cancelled,
    });
  }
  return rows;
}
