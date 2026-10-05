import { useMutation, useQuery } from "convex/react";
import { api } from "./api";

/**
 * Travel & delivery fee for one event or proposal (convex/travelFees.ts).
 * Event and finance features call these instead of importing convex/react.
 */
export function useEventTravelFee(eventId: string | null) {
  return useQuery(
    api.travelFees.getEventTravelFee,
    eventId ? { eventId } : "skip",
  );
}

export function useProposalTravelFee(proposalId: string | null) {
  return useQuery(
    api.travelFees.getProposalTravelFee,
    proposalId ? { proposalId } : "skip",
  );
}

export function useApplyProposalTravelFee() {
  return useMutation(api.travelFees.applyProposalTravelFee);
}
