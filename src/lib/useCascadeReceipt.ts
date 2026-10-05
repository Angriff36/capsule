import { useQuery } from "convex/react";
import { api } from "./api";

/**
 * What the automation did after the newest step this person ran on a
 * record, or null. Record features must not import convex/react; call this.
 */
export function useLatestCascadeReceipt(recordId: string | null | undefined) {
  return useQuery(
    api.commandReceipts.latestCascadeReceipt,
    recordId ? { recordId } : "skip",
  );
}
