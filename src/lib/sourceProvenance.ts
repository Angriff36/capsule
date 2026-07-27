// Thin client hook over the authored source-provenance seam. Lives in
// src/lib (not src/features) so feature roots stay free of direct convex/react
// hooks — the page imports this wrapper. Mirrors src/lib/staffSelfReviews.ts.
import { useQuery } from "convex/react";
import { api } from "./api";

/**
 * Active ExternalRecordLink(s) that point at a Capsule entity (its _id).
 * Returns `undefined` while loading and `[]` for non-importAccess callers or
 * entities with no import provenance — callers render nothing in those cases.
 */
export function useSourceLinksByCapsuleId(
  capsuleId: string | undefined | null,
) {
  return useQuery(
    api.sourceProvenance.listByCapsuleId,
    capsuleId ? { capsuleId } : "skip",
  );
}
