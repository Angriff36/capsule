import { useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";
import { EventOverviewCard } from "../events/EventOverviewCard";

/**
 * Enhancements the client saw on the proposal that booked this event (C3 /
 * AC-005), rendered by the event overview (EventOverviewTab). Lives beside
 * the other Proposal readers in clients/ — the event-feature guard forbids
 * direct useQuery outside EventGuestPanel — and reaches the rows through the
 * reverse lookup (Proposal.eventId), so nothing is re-keyed onto the event.
 * The generated reads degrade to an empty list for roles without
 * salesAccess, so the card simply hides.
 */
export function EventProposalEnhancementsCard({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const proposals = useQuery(api.queries.listProposalByEventId, { eventId });
  const proposal = (proposals ?? []).find((row) => row.deletedAt == null);
  const enhancements = useQuery(
    api.queries.listProposalEnhancementByProposalId,
    proposal ? { proposalId: proposal._id } : "skip",
  );
  if (enhancements === undefined) return null;
  const rows = enhancements
    .filter((row) => row.addedAt != null && row.removedAt == null)
    .sort((left, right) => Number(left.sortOrder) - Number(right.sortOrder));
  if (rows.length === 0) return null;
  return (
    <EventOverviewCard title="Enhancements" testId="event-enhancements-card">
      <ul className="space-y-1.5 text-sm text-ink-2">
        {rows.map((row) => (
          <li key={row._id}>
            <span className="font-medium text-ink">{row.name}</span>
            {row.description ? ` — ${row.description}` : ""}
            {` · ${formatMoneyExact(Number(row.price) || 0)}`}
          </li>
        ))}
      </ul>
    </EventOverviewCard>
  );
}
