import { useAction, useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hooks for the Goodshuffle item list seam (convex/goodshuffleItems.ts). */
export function useImportGoodshuffleItems() {
  return useMutation(api.goodshuffleItems.importGoodshuffleItems);
}

export function useBringInGoodshufflePicture() {
  return useAction(api.goodshuffleItems.bringInPicture);
}

/** Authored hook for the old-system equipment list seam (convex/tppEquipmentItems.ts). */
export function useImportTppEquipmentItems() {
  return useMutation(api.tppEquipmentItems.importTppEquipmentItems);
}
