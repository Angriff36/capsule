import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api, type Id } from "../../lib/api";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { EventOverviewCard } from "../events/EventOverviewCard";

/**
 * Where this event came from (C4 / AC-002): the proposal whose eventId points
 * back at it, reached through the reverse lookup — never a free-text copy.
 * Rendered by the event overview (EventOverviewTab); lives beside the other
 * Proposal readers in clients/ because the event-feature guard allows direct
 * useQuery in EventGuestPanel only. The accepted revision is the completed
 * signature request's snapshot when the client signed digitally, else the
 * highest captured revisionNumber; the agent bundle path (raw Proposal.send,
 * issue #241) captures no revision, and the card says so instead of guessing.
 * The generated reads degrade to an empty list for roles without salesAccess,
 * so the card simply hides.
 */
export function EventProposalSourceCard({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const proposals = useQuery(api.queries.listProposalByEventId, { eventId });
  const proposal = (proposals ?? []).find((row) => row.deletedAt == null);
  const revisions = useQuery(
    api.queries.listProposalRevisionByProposalId,
    proposal ? { proposalId: proposal._id } : "skip",
  );
  const signatures = useQuery(
    api.queries.listSignatureRequest,
    proposal ? {} : "skip",
  );
  if (!proposal || revisions === undefined || signatures === undefined) {
    return null;
  }
  // A digital acceptance signs one captured revision, so it wins over the
  // highest number — a later send can capture a revision after the signature.
  const signed = signatures.find(
    (row) => row.proposalId === proposal._id && row.status === "completed",
  );
  const signedRevision = signed
    ? revisions.find((row) => row._id === signed.proposalRevisionId)
    : undefined;
  const latest = [...revisions].sort(
    (left, right) => right.revisionNumber - left.revisionNumber,
  )[0];
  const revisionLabel = signedRevision
    ? `Revision ${signedRevision.revisionNumber} — signed digitally`
    : latest
      ? `Revision ${latest.revisionNumber}`
      : "no revision captured";
  const label = proposal.proposalNumber || proposal.title || "Proposal";
  return (
    <EventOverviewCard
      title="Booked from proposal"
      testId="event-proposal-source-card"
    >
      <p className="text-sm text-ink-2">
        <Link
          className="text-link font-medium"
          to={CLIENTS_ROUTES.proposal(proposal._id)}
        >
          {label}
        </Link>
        <span className="text-ink-3">{` · ${revisionLabel}`}</span>
      </p>
    </EventOverviewCard>
  );
}
