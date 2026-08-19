import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { STOCK_FOCUS_PARAM } from "./stockLevels";

export const stockRowDomId = (inventoryItemId: string) =>
  `stock-row-${inventoryItemId}`;

/**
 * Reads `?item=<inventoryItemId>` (set by low-stock notification deep links,
 * see stockLineLink) and scrolls the matching stock-book row into view once
 * the table has data. Returns the focused id so the row can render
 * highlighted; scrolls once per visit so later re-renders don't yank the page.
 */
export function useFocusedStockRow(rowsReady: boolean): string | null {
  const [searchParams] = useSearchParams();
  const focusedItemId = searchParams.get(STOCK_FOCUS_PARAM);
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!rowsReady || focusedItemId == null || hasScrolled.current) return;
    const row = document.getElementById(stockRowDomId(focusedItemId));
    if (!row) return;
    hasScrolled.current = true;
    row.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [rowsReady, focusedItemId]);
  return focusedItemId;
}
