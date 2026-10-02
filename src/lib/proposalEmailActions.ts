import { useAction } from "convex/react";
import { useCallback } from "react";
import { api, type Id } from "./api";

/** Authored "Email the proposal" action kept outside client feature code. */
export function useEmailProposal() {
  const sendAction = useAction(api.proposalEmail.send);
  return useCallback(
    (input: {
      proposalId: string;
      revisionId: string;
      pdfBase64: string;
      fileName: string;
    }) =>
      sendAction({
        proposalId: input.proposalId as Id<"proposals">,
        revisionId: input.revisionId,
        pdfBase64: input.pdfBase64,
        fileName: input.fileName,
      }),
    [sendAction],
  );
}
