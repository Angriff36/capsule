import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "./api";

/**
 * Client tasting seams. Feature pages must not import convex/react; call these.
 * The prep list is built on read; applying copies approved dishes onto a
 * proposal menu through the generated selection command.
 */
export function useTastingPrepList(tastingId: string | null) {
  return useQuery(
    api.tastingPrep.prepList,
    tastingId ? { tastingId: tastingId as Id<"tastings"> } : "skip",
  );
}

export function useApplyTastingSelections() {
  return useMutation(api.tastingApply.applyApprovedSelections);
}
