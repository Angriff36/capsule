/**
 * Marks a draft that was opened from an accepted proposal.
 * An ordinary proposal renders nothing.
 */
export function ProposalChangeLabel({
  replacesProposalId,
}: Readonly<{
  replacesProposalId?: string | null;
}>) {
  if (replacesProposalId == null || replacesProposalId === "") return null;
  return (
    <p className="mt-1 text-base text-ink-2">Change of the accepted proposal</p>
  );
}
