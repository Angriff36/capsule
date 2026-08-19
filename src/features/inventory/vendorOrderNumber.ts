/**
 * Vendor order numbering.
 *
 * Weekly auto-drafts persist a real human number in-domain via
 * VendorOrder.ensureWeeklyDraft ("PO-" + (orderSequence + 1)). This helper
 * is for the manual open-order form (prefill) and for display of any
 * pre-fix row that still has a blank orderNumber. The short-id fallback
 * must never be treated as a successful weekly-draft number.
 */

/** Suggested PO number for the open-order form, e.g. "PO-20260819-4F2A". */
export function suggestOrderNumber(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PO-${datePart}-${randomPart}`;
}

/** Display title: persisted orderNumber when set; legacy rows fall back. */
export function vendorOrderTitle(order: {
  _id: string;
  orderNumber?: string | null;
}): string {
  const number = order.orderNumber?.trim();
  return number || `Order ${order._id.slice(-8)}`;
}
