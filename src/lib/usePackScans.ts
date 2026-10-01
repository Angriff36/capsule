import { useMutation, useQuery } from "convex/react";
import { api } from "./api";

/**
 * A scan that counts a pack line, saved together with its kept record, and
 * the latest kept scans on one list. Feature pages must not import
 * convex/react; call these.
 */
export function usePackScanCount() {
  return useMutation(api.packScans.count);
}

export function usePackScansForList(packListId: string) {
  return useQuery(api.packScans.listForPackList, {
    packListId: packListId as never,
  });
}
