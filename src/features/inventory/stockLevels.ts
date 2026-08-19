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

export type CatalogUnitIngredient = {
  _id: string;
  unit?: string | null;
};

/**
 * Paint stock quantities in the ingredient's catalog unit. Opening a line
 * locks unit to catalog (#150 / PR 175); existing rows may still store
 * "each" while the catalog says kilogram. Labels follow the catalog.
 */
export function catalogUnitForStockLine(
  item: { ingredientId?: string | null; unit?: string | null },
  ingredients: readonly CatalogUnitIngredient[],
): string {
  const catalog = ingredients.find(
    (row) => row._id === item.ingredientId,
  )?.unit;
  const label = String(catalog ?? item.unit ?? "").trim();
  return label || "unit";
}
