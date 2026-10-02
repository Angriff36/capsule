import { useQuery } from "convex/react";
import { api } from "./api";

/**
 * Only the imported-record links a screen works with. The full list grew past
 * what the server can return in one list (9,385 links on 2026-10-02).
 */
export function useExternalRecordLinksFor(filter: {
  recordTypes?: string[];
  pending?: boolean;
  capsuleEntities?: string[];
}) {
  return useQuery(api.externalRecordLinkLists.listFor, filter);
}

/** The parallel-run menu check, counted on the server. */
export function useMenuLinkStats() {
  return useQuery(api.externalRecordLinkLists.menuLinkStats, {});
}
