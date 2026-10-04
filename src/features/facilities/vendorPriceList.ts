import { useMutation, useQuery } from "convex/react";
import { api } from "../../lib/api";

/** Authored hook for the vendor price list seam (convex/vendorPriceList.ts). */
export function useImportVendorPriceRows() {
  return useMutation(api.vendorPriceList.importVendorPriceRows);
}

/** Every price the vendor items for one ingredient have had, newest first. */
export function useVendorItemPriceHistory(ingredientId: string) {
  return useQuery(api.vendorPriceList.priceHistory, { ingredientId });
}
