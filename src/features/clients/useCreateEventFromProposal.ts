import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";

export type CreateEventFromProposalArgs = {
  proposalId: Id<"proposals">;
  proposalVersion?: number;
  /** Event.planEngagement command args (built by eventPlanEngagementFormMapper). */
  event: Record<string, unknown>;
};

export type CreateEventFromProposalResult = {
  docId: Id<"events">;
};

/**
 * Books an accepted proposal into a new event in one transaction: creates the
 * event through the generated planEngagement command, then runs the
 * Proposal.linkEvent domain command, whose ProposalEventLinked cascade copies
 * the proposal's menu selections into EventDish lines. Authored seam:
 * convex/lib/proposalEventCreation.ts (issue #141).
 *
 * Lives in the clients feature (not features/events) so the events feature
 * keeps its "generated hooks only" integration guard intact.
 */
export function useCreateEventFromProposal() {
  const mutate = useMutation(
    api.lib.proposalEventCreation.createEventFromAcceptedProposal,
  );
  return (
    args: CreateEventFromProposalArgs,
  ): Promise<CreateEventFromProposalResult> =>
    mutate(
      args as unknown as Parameters<typeof mutate>[0],
    ) as Promise<CreateEventFromProposalResult>;
}
