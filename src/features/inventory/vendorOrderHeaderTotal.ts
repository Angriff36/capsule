/**
 * Client-side vendor-order header money (issue #140 leftover).
 *
 * `liveTotalAmount` is the Manifest read-time computed (sum of stored
 * `lineTotalAmount` + tax + shipping). List queries often omit child
 * hydration, and pre-#140 received rows still have null `lineTotalAmount`,
 * so the inlined computed / stored `totalAmount` can be $0 while the line
 * row paints `lineTotal` (orderedQuantity * unitCost) as $100.
 *
 * Folio + purchasing already load lines. Reconstruct header money from
 * those line facts so a received PO with a $100 line cannot paint $0.
 */

export type VendorOrderHeaderFields = {
  _id: string;
  liveTotalAmount?: number | null;
  totalAmount?: number | null;
  taxAmount?: number | null;
  shippingAmount?: number | null;
};

export type VendorOrderLineMoneyFields = {
  vendorOrderId?: string | null;
  deletedAt?: number | null;
  status?: string | null;
  lineTotalAmount?: number | null;
  lineTotal?: number | null;
  orderedQuantity?: number | null;
  unitCost?: number | null;
};

function finiteMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}

/** One line's money: stored fact, then the painted computed, then qty * cost. */
export function vendorOrderLineMoney(line: VendorOrderLineMoneyFields): number {
  const stored = finiteMoney(line.lineTotalAmount);
  if (stored != null) return stored;
  const painted = finiteMoney(line.lineTotal);
  if (painted != null) return painted;
  const quantity = finiteMoney(line.orderedQuantity);
  const unitCost = finiteMoney(line.unitCost);
  if (quantity != null && unitCost != null) return quantity * unitCost;
  return 0;
}

function reconstructFromLines(
  order: VendorOrderHeaderFields,
  lines: readonly VendorOrderLineMoneyFields[],
): number {
  const lineSum = lines
    .filter(
      (line) =>
        line.deletedAt == null &&
        (line.vendorOrderId == null || line.vendorOrderId === order._id),
    )
    .reduce((sum, line) => sum + vendorOrderLineMoney(line), 0);
  return (
    lineSum +
    (finiteMoney(order.taxAmount) ?? 0) +
    (finiteMoney(order.shippingAmount) ?? 0)
  );
}

/**
 * Header amount painted on the folio masthead and purchasing ledgers.
 * Prefers the largest of live / stored / line-reconstructed so an
 * unhydrated or pre-#140 $0 header cannot hide a $100 line.
 */
export function vendorOrderHeaderTotal(
  order: VendorOrderHeaderFields,
  lines?: readonly VendorOrderLineMoneyFields[] | null,
): number {
  const candidates: number[] = [];
  const live = finiteMoney(order.liveTotalAmount);
  const stored = finiteMoney(order.totalAmount);
  if (live != null) candidates.push(live);
  if (stored != null) candidates.push(stored);
  if (lines != null) candidates.push(reconstructFromLines(order, lines));
  return candidates.length === 0 ? 0 : Math.max(...candidates);
}
