import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";

export type StartProposalChangeResult = {
  docId: Id<"proposals">;
  alreadyStarted: boolean;
};

/**
 * Opens a new draft from an accepted proposal without rewriting the accepted
 * copy. Authored seam: convex/lib/proposalChangeDraft.ts.
 */
export function useStartProposalChange() {
  const mutate = useMutation(api.lib.proposalChangeDraft.startProposalChange);
  return (args: {
    proposalId: Id<"proposals">;
  }): Promise<StartProposalChangeResult> =>
    mutate(args) as Promise<StartProposalChangeResult>;
}
