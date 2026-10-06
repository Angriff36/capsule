/**
 * Marks a draft that revises an earlier proposal (sent or accepted).
 * An ordinary proposal renders nothing.
 */
export function ProposalChangeLabel({
  replacesProposalId,
}: Readonly<{
  replacesProposalId?: string | null;
}>) {
  if (replacesProposalId == null || replacesProposalId === "") return null;
  return (
    <p className="mt-1 text-base text-ink-2">
      Revised version of an earlier proposal
    </p>
  );
}
