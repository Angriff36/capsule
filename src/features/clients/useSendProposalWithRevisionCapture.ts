import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";

export interface SendProposalWithRevisionCaptureArgs {
  docId: Id<"proposals">;
  version?: number;
  /** Defaults on the server to "Proposal sent to client". */
  changeSummary?: string;
}

/**
 * The one way the UI sends a proposal: the authored seam
 * `lib/proposalRevision.sendProposalWithRevisionCapture` audits unapproved
 * catalog price overrides, runs the generated `Proposal_send`, and captures
 * the immutable revision snapshot in one transaction. Sales screens and the
 * event Import screen share this hook so a sent proposal always has a
 * revision record, whichever screen sent it (#241).
 */
export function useSendProposalWithRevisionCapture(): (
  args: SendProposalWithRevisionCaptureArgs,
) => Promise<unknown> {
  return useMutation(api.lib.proposalRevision.sendProposalWithRevisionCapture);
}
