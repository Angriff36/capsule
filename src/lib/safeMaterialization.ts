import { useMutation } from "convex/react";
import { api } from "./api";

export function useApplyPackTemplate() {
  return useMutation(api.lib.safeMaterialization.applyPackTemplate);
}

export function useApplyLayoutTemplate() {
  return useMutation(api.lib.safeMaterialization.applyLayoutTemplate);
}

export function useDraftPurchaseOrder() {
  return useMutation(api.lib.safeMaterialization.draftPurchaseOrder);
}
