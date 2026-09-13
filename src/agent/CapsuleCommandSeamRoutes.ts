import type { FunctionReference } from "convex/server";
import { api } from "../lib/api";

/**
 * Commands the screens deliberately run through an authored Convex seam
 * instead of the bare generated mutation, because the seam does more in the
 * same transaction. The agent executor takes the same route so a bundle
 * entered by the importer leaves the same trail a person's click would.
 *
 * Proposal.send: the Sales screens call
 * `lib/proposalRevision.sendProposalWithRevisionCapture`, which audits catalog
 * price overrides, runs the generated send, and captures the immutable
 * revision snapshot — all or nothing. The seam has no idempotency key; the
 * bundle planner only plans a send for a proposal that is still a draft, and
 * a replay on a sent proposal is refused by the send guard itself.
 */

export interface CapsuleCommandSeamRoute {
  ref: FunctionReference<"mutation">;
  args(commandArgs: Record<string, unknown>): Record<string, unknown>;
}

const ROUTES: Record<string, CapsuleCommandSeamRoute> = {
  "Proposal.send": {
    ref: api.lib.proposalRevision
      .sendProposalWithRevisionCapture as unknown as FunctionReference<"mutation">,
    args: (commandArgs) => ({
      docId: commandArgs.docId,
      ...(commandArgs.version !== undefined
        ? { version: commandArgs.version }
        : {}),
      changeSummary: "Proposal sent from the TPP reports import",
    }),
  },
};

export class CapsuleCommandSeamRoutes {
  get(capabilityId: string): CapsuleCommandSeamRoute | undefined {
    return ROUTES[capabilityId];
  }
}
