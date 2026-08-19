import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { STOCK_FOCUS_PARAM } from "./stockLevels";

export const stockRowDomId = (inventoryItemId: string) =>
  `stock-row-${inventoryItemId}`;

/**
 * Reads `?item=<inventoryItemId>` (set by low-stock notification deep links,
 * see stockLineLink) and scrolls the matching stock-book row into view.
 * `rowsReady` must be true only once the row DOM nodes exist — pass the same
 * gate the table uses to render rows, not just one of its queries — because
 * the effect does not retry a missed getElementById. Returns the focused id
 * so the row can render highlighted. No scroll latch: the effect deps already
 * ignore live data rerenders, and clicking a second alert while the stock
 * book is open must scroll again (the tray is a Link overlay, so only
 * ?item= changes).
 */
export function useFocusedStockRow(rowsReady: boolean): string | null {
  const [searchParams] = useSearchParams();
  const focusedItemId = searchParams.get(STOCK_FOCUS_PARAM);
  useEffect(() => {
    if (!rowsReady || focusedItemId == null) return;
    document
      .getElementById(stockRowDomId(focusedItemId))
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [rowsReady, focusedItemId]);
  return focusedItemId;
}
