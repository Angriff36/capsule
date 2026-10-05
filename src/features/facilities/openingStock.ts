import { useAction, useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hooks for the opening stock seam (convex/openingStock.ts). */
export function useReviewOpeningStock() {
  return useMutation(api.openingStock.reviewOpeningStock);
}

export function useSetAsideOpeningStock() {
  return useMutation(api.openingStock.setAsideOpeningStock);
}

export function useApplyOpeningStock() {
  return useMutation(api.openingStock.applyOpeningStock);
}

/** The one-shot import, used with datasetType "stock". */
export function useImportStockFile() {
  return useAction(api.quickImport.importFile);
}
