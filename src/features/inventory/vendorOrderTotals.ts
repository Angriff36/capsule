/**
 * User-facing vendor-order header money.
 *
 * `VendorOrder.liveTotalAmount` is the query-inlined computed
 * (`sum(lineTotalAmount) + tax + shipping`). Pre-#140 production rows can
 * still have a $100 line (`orderedQuantity * unitCost` / `lineTotal`) while
 * `lineTotalAmount` and the stored header are 0, so `liveTotalAmount ?? totalAmount`
 * paints $0.00. Prefer existing totals already on the order record — never
 * invent schema.
 */
export type VendorOrderLineMoneySource = {
  deletedAt?: number | null;
  status?: string | null;
  lineTotalAmount?: number | null;
  /** Query-inlined `orderedQuantity * unitCost`. */
  lineTotal?: number | null;
  orderedQuantity?: number | null;
  unitCost?: number | null;
};

export type VendorOrderMoneySource = {
  liveTotalAmount?: number | null;
  totalAmount?: number | null;
  taxAmount?: number | null;
  shippingAmount?: number | null;
  lines?: readonly VendorOrderLineMoneySource[] | null;
};

function finiteMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

export function vendorOrderLineAmount(
  line: VendorOrderLineMoneySource,
): number {
  if (line.deletedAt != null) return 0;
  if (String(line.status ?? "") === "cancelled") return 0;
  const stored = finiteMoney(line.lineTotalAmount);
  if (stored != null) return stored;
  const painted = finiteMoney(line.lineTotal);
  if (painted != null) return painted;
  const quantity = finiteMoney(line.orderedQuantity) ?? 0;
  const unitCost = finiteMoney(line.unitCost) ?? 0;
  return quantity * unitCost;
}

export function vendorOrderHeaderTotal(
  order: VendorOrderMoneySource,
  lines?: readonly VendorOrderLineMoneySource[] | null,
): number {
  const source =
    lines != null && lines.length > 0
      ? lines
      : Array.isArray(order.lines) && order.lines.length > 0
        ? order.lines
        : null;

  let rolled: number | null = null;
  if (source != null) {
    const lineSum = source.reduce(
      (sum, line) => sum + vendorOrderLineAmount(line),
      0,
    );
    rolled =
      lineSum +
      (finiteMoney(order.taxAmount) ?? 0) +
      (finiteMoney(order.shippingAmount) ?? 0);
  }

  const live = finiteMoney(order.liveTotalAmount);
  const stored = finiteMoney(order.totalAmount);

  if (rolled != null && rolled !== 0) return rolled;
  if (live != null && live !== 0) return live;
  if (stored != null && stored !== 0) return stored;
  if (rolled != null) return rolled;
  return live ?? stored ?? 0;
}
