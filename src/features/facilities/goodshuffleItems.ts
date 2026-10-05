import { useAction, useMutation } from "convex/react";
import { api } from "../../lib/api";

/** Authored hooks for the Goodshuffle item list seam (convex/goodshuffleItems.ts). */
export function useImportGoodshuffleItems() {
  return useMutation(api.goodshuffleItems.importGoodshuffleItems);
}

export function useBringInGoodshufflePicture() {
  return useAction(api.goodshuffleItems.bringInPicture);
}
