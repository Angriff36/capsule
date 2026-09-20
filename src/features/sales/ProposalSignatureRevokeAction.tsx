import {
  useListSignatureRequest,
  useSignatureRequestRevoke,
} from "../../lib/manifest-convex-react";
import type { ActionPromptSession } from "../../ui/action-prompt";

/**
 * Revoke a pending signature request on a proposal row. Runs the governed
 * SignatureRequest.revoke command, which only accepts a request that is still
 * pending and always wants a reason. Revoking kills the acceptance link the
 * client holds, so the action asks for that reason first.
 */
export function ProposalSignatureRevokeAction({
  proposalId,
  prompt,
  busy,
  run,
}: Readonly<{
  proposalId: string;
  prompt: ActionPromptSession;
  busy: string | null;
  run: (key: string, work: () => Promise<void>) => Promise<void>;
}>) {
  const signatureRequests = useListSignatureRequest();
  const revoke = useSignatureRequestRevoke();
  const pending = (signatureRequests ?? []).find(
    (row) =>
      row.deletedAt == null &&
      String(row.proposalId) === proposalId &&
      String(row.status) === "requested",
  );
  if (!pending) return null;
  const key = `${proposalId}:revoke-signature`;

  const onClick = () => {
    void (async () => {
      const revokeReason = (
        await prompt.askReason({
          title: "Revoke signature request",
          description: `${String(pending.recipientName ?? "The recipient")} can no longer accept with the link they were sent.`,
          label: "Reason for revoking",
          confirmLabel: "Revoke request",
          tone: "danger",
        })
      )?.trim();
      if (!revokeReason) return;
      await run(key, async () => {
        await revoke({
          docId: pending._id,
          version: pending.version,
          revokeReason,
        });
      });
    })();
  };

  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={busy != null}
      onClick={onClick}
    >
      {busy === key ? "Working…" : "Revoke signature"}
    </button>
  );
}
