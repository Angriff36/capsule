import { useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hook for the vendor price list seam (convex/vendorPriceList.ts). */
export function useImportVendorPriceRows() {
  return useMutation(api.vendorPriceList.importVendorPriceRows);
}
