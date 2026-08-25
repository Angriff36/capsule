import { useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { STOCK_FOCUS_PARAM } from "./stockLevels";

export const stockRowDomId = (inventoryItemId: string) =>
  `stock-row-${inventoryItemId}`;

export type StockFocusLatch = {
  pendingId: string | null;
  scrolledForId: string | null;
};

/**
 * Capture `?item=` even when the first paint after navigation has no rows yet.
 * Changing the focused id clears the success latch so a second alert still
 * centers. Clearing `?item=` drops the pending id.
 */
export function nextStockFocusLatch(
  prev: StockFocusLatch,
  focusedItemId: string | null,
): StockFocusLatch {
  if (focusedItemId == null) {
    return { pendingId: null, scrolledForId: null };
  }
  if (prev.pendingId === focusedItemId) return prev;
  return {
    pendingId: focusedItemId,
    scrolledForId:
      prev.scrolledForId === focusedItemId ? prev.scrolledForId : null,
  };
}

/** Row id to scroll, or null when we already scrolled this focus or rows aren't ready. */
export function stockFocusScrollId(
  rowsReady: boolean,
  latch: StockFocusLatch,
): string | null {
  if (!rowsReady || latch.pendingId == null) return null;
  if (latch.scrolledForId === latch.pendingId) return null;
  return latch.pendingId;
}

/**
 * Reads `?item=<inventoryItemId>` (set by low-stock notification deep links,
 * see stockLineLink) and scrolls the matching stock-book row into view.
 *
 * `rowsReady` must be true only once the row DOM nodes exist — pass the same
 * gate the table uses to render rows. First land: the latch keeps `?item=`
 * across the paint where queries are still empty, then useLayoutEffect + rAF
 * retry until getElementById hits. Live data rerenders with the same `?item=`
 * do not re-scroll once that id is latched as scrolled. Clicking a second
 * alert while the stock book is open still scrolls (pending id changes).
 *
 * `rowEpoch` should change when the table's row list identity changes so a
 * missed first paint (empty `[]` then hydrated rows) retries.
 */
export function useFocusedStockRow(
  rowsReady: boolean,
  rowEpoch?: unknown,
): string | null {
  const [searchParams] = useSearchParams();
  const focusedItemId = searchParams.get(STOCK_FOCUS_PARAM);
  const latchRef = useRef<StockFocusLatch>({
    pendingId: null,
    scrolledForId: null,
  });

  latchRef.current = nextStockFocusLatch(latchRef.current, focusedItemId);

  useLayoutEffect(() => {
    const scrollId = stockFocusScrollId(rowsReady, latchRef.current);
    if (scrollId == null) return;

    const tryScroll = (): boolean => {
      const el = document.getElementById(stockRowDomId(scrollId));
      if (!el) return false;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      latchRef.current = { pendingId: scrollId, scrolledForId: scrollId };
      return true;
    };

    if (tryScroll()) return;
    const frame = requestAnimationFrame(() => {
      tryScroll();
    });
    return () => cancelAnimationFrame(frame);
  }, [rowsReady, focusedItemId, rowEpoch]);

  return focusedItemId ?? latchRef.current.pendingId;
}
