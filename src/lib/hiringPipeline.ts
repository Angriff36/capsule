// Thin client hooks over authored hiring seams. Live in src/lib (not
// src/features/workforce) because the workforce slice integration guard
// forbids direct convex/react hooks in the workforce feature root — the page
// imports these wrappers instead. Mirrors src/lib/staffSelfReviews.ts.
import { useAction, useMutation } from "convex/react";
import { api } from "./api";

/** Idempotently ingest a pasted KM interview-tool export (spec §9.3). */
export function useIngestKmCandidates() {
  return useMutation(api.hiringPipeline.ingestKmCandidates);
}

/** Create the team profile for a hired candidate (Person row + link). */
export function useHireCandidateIntoTeam() {
  return useMutation(api.candidateToTeam.hireIntoTeam);
}

/** Email a hired person their sign-in link + password (Clerk provisioning). */
export function useProvisionStaffSignIn() {
  return useAction(api.authProvision.provisionStaffSignIn);
}
