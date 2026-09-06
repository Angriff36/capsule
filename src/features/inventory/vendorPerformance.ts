export interface VendorOrderPerformanceInput {
  _id: string;
  vendorId: string;
  status: string;
  sourceRangeEnd?: number | null;
  receivedAt?: number | null;
  deletedAt?: number | null;
}

export interface VendorOrderLinePerformanceInput {
  vendorOrderId: string;
  status: string;
  orderedQuantity: number | string;
  receivedQuantity: number | string;
  deletedAt?: number | null;
}

export interface PriceObservationPerformanceInput {
  vendorId: string;
  ingredientId: string;
  unitPrice: number | string;
  observedAt?: number | null;
  createdAt?: number | null;
  deletedAt?: number | null;
}

export interface VendorPerformance {
  vendorId: string;
  /** Received orders inside the rolling window. */
  sampleSize: number;
  /** Share of windowed orders received by their purchasing-week end (0..1). */
  onTimeRate: number | null;
  /** Received quantity vs ordered quantity across windowed lines (0..1). */
  fillAccuracy: number | null;
  /** 1 − average per-ingredient price coefficient of variation (0..1). */
  priceStability: number | null;
  /** Weighted composite of the available metrics, 0..100. */
  score: number | null;
}

export const receivedByWeekEndLabel = (rate: number) =>
  `Received by purchasing-week end ${Math.round(rate * 100)}%`;

export const PERFORMANCE_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

function num(value: number | string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ponytail: on-time = fully received by the purchasing-week end; orders
// without a source range (ad-hoc) are excluded from the on-time metric.
export function computeVendorPerformance(
  vendorIds: string[],
  orders: VendorOrderPerformanceInput[],
  lines: VendorOrderLinePerformanceInput[],
  observations: PriceObservationPerformanceInput[],
  now: number,
): Map<string, VendorPerformance> {
  const windowStart = now - PERFORMANCE_WINDOW_MS;

  const receivedOrders = orders.filter(
    (order) =>
      order.deletedAt == null &&
      order.status === "received" &&
      order.receivedAt != null &&
      order.receivedAt >= windowStart,
  );
  const orderVendor = new Map(
    receivedOrders.map((order) => [order._id, order.vendorId]),
  );

  const result = new Map<string, VendorPerformance>();
  for (const vendorId of vendorIds) {
    const vendorOrders = receivedOrders.filter(
      (order) => order.vendorId === vendorId,
    );

    const timed = vendorOrders.filter((order) => order.sourceRangeEnd != null);
    const onTimeRate =
      timed.length === 0
        ? null
        : timed.filter((order) => order.receivedAt! <= order.sourceRangeEnd!)
            .length / timed.length;

    let ordered = 0;
    let received = 0;
    for (const line of lines) {
      if (line.deletedAt != null || line.status === "cancelled") continue;
      if (orderVendor.get(line.vendorOrderId) !== vendorId) continue;
      ordered += num(line.orderedQuantity);
      received += num(line.receivedQuantity);
    }
    const fillAccuracy = ordered > 0 ? Math.min(received / ordered, 1) : null;

    const priceStability = computePriceStability(
      observations.filter(
        (observation) =>
          observation.deletedAt == null &&
          observation.vendorId === vendorId &&
          (observation.observedAt ?? observation.createdAt ?? 0) >= windowStart,
      ),
    );

    result.set(vendorId, {
      vendorId,
      sampleSize: vendorOrders.length,
      onTimeRate,
      fillAccuracy,
      priceStability,
      score: compositeScore(onTimeRate, fillAccuracy, priceStability),
    });
  }
  return result;
}

function computePriceStability(
  observations: PriceObservationPerformanceInput[],
): number | null {
  const byIngredient = new Map<string, number[]>();
  for (const observation of observations) {
    const price = num(observation.unitPrice);
    if (price <= 0) continue;
    const prices = byIngredient.get(observation.ingredientId) ?? [];
    prices.push(price);
    byIngredient.set(observation.ingredientId, prices);
  }
  const variations: number[] = [];
  for (const prices of byIngredient.values()) {
    if (prices.length < 2) continue;
    const mean = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const variance =
      prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
    variations.push(Math.sqrt(variance) / mean);
  }
  if (variations.length === 0) return null;
  const meanCv =
    variations.reduce((sum, cv) => sum + cv, 0) / variations.length;
  return Math.max(0, Math.min(1, 1 - meanCv));
}

function compositeScore(
  onTimeRate: number | null,
  fillAccuracy: number | null,
  priceStability: number | null,
): number | null {
  const parts: Array<[number, number]> = [];
  if (onTimeRate != null) parts.push([onTimeRate, 0.4]);
  if (fillAccuracy != null) parts.push([fillAccuracy, 0.4]);
  if (priceStability != null) parts.push([priceStability, 0.2]);
  if (parts.length === 0) return null;
  const totalWeight = parts.reduce((sum, [, weight]) => sum + weight, 0);
  const weighted = parts.reduce(
    (sum, [value, weight]) => sum + value * weight,
    0,
  );
  return Math.round((weighted / totalWeight) * 100);
}

/** Sort comparator: highest score first, unscored vendors last, ties by name. */
export function byVendorScore(
  performance: Map<string, VendorPerformance>,
): (
  a: { _id: string; name: string },
  b: { _id: string; name: string },
) => number {
  return (a, b) => {
    const scoreA = performance.get(a._id)?.score;
    const scoreB = performance.get(b._id)?.score;
    if (scoreA == null && scoreB == null) return a.name.localeCompare(b.name);
    if (scoreA == null) return 1;
    if (scoreB == null) return -1;
    return scoreB - scoreA || a.name.localeCompare(b.name);
  };
}
