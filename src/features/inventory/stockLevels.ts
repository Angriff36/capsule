/**
 * Client-side mirror of the InventoryItem domain computed properties
 * (src/inventory/stock.manifest). List queries return raw docs, so surfaces
 * that alert on stock levels re-derive these; keeping the predicate here stops
 * each surface from inventing its own (the tray once alerted on unconfigured
 * 0-on-hand / 0-threshold lines because it compared `qty <= threshold`).
 */

export interface StockLevelFields {
  quantityOnHand: number;
  reorderThreshold: number;
}

/** Mirrors `computed isBelowReorder` — a zero threshold means "not tracked". */
export function isBelowReorder(item: StockLevelFields): boolean {
  return (
    item.reorderThreshold > 0 && item.quantityOnHand < item.reorderThreshold
  );
}

/** Deep link to the stock book with one stock line focused (see StockBookPage). */
export function stockLineLink(inventoryItemId: string): string {
  return `/inventory/stock?item=${inventoryItemId}`;
}

/** Query-param key StockBookPage reads to scroll/highlight a stock line. */
export const STOCK_FOCUS_PARAM = "item";
