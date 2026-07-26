// Thin client hook over the authored staff-self-reviews seam. Lives in
// src/lib (not src/features/workforce) because the workforce slice guard
// forbids direct convex/react hooks in feature roots — the page imports this
// wrapper instead. Mirrors how api.ts / manifest-convex-react.ts centralize
// Convex access here.
import { useQuery } from "convex/react";
import { api } from "./api";

/** Recorded performance reviews OF the current user (reviewee), notes omitted. */
export function useMyReviews() {
  return useQuery(api.staffSelfReviews.listMyReviews, {});
}
