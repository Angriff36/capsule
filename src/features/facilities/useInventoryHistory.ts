// Seam hook for convex/inventoryHistoryWindow.ts. Lives in facilities (the
// unguarded seam-hook home) because the inventory guard forbids convex/react
// in its own directory. Stock screens use it instead of the generated
// useListInventoryItem, which attaches every hold ever made to every line.
import { useQuery } from "convex/react";
import { api } from "../../lib/api";

/**
 * The company's stock lines with only the holds the screen uses: "none"
 * (no hold fields), "totals" (totalReserved and availableQuantity), or
 * "active" (also the active holds and per-lot allocated quantities).
 */
export function useStockLines(holds: "none" | "totals" | "active") {
  return useQuery(api.inventoryHistoryWindow.stockLines, { holds });
}

export type StockLineRow = NonNullable<
  ReturnType<typeof useStockLines>
>[number];
