// Thin client hook over the authored KM-ingest seam. Lives in src/lib (not
// src/features/workforce) because the workforce slice integration guard
// forbids direct convex/react hooks in the workforce feature root — the page
// imports this wrapper instead. Mirrors src/lib/staffSelfReviews.ts.
import { useMutation } from "convex/react";
import { api } from "./api";

/** Idempotently ingest a pasted KM interview-tool export (spec §9.3). */
export function useIngestKmCandidates() {
  return useMutation(api.hiringPipeline.ingestKmCandidates);
}
