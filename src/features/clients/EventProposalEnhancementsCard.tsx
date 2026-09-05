import { useQuery } from "convex/react";
import { api, type Id } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";
import { EventOverviewCard } from "../events/EventOverviewCard";

export function EventProposalEnhancementsCard({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const booking = useQuery(api.quoteBuilder.getEventBookingDetails, {
    eventId,
  });
  const rows = booking?.enhancements ?? [];
  if (rows.length === 0) return null;
  return (
    <EventOverviewCard title="Enhancements" testId="event-enhancements-card">
      <ul className="space-y-1.5 text-sm text-ink-2">
        {rows.map((row) => (
          <li key={row._id}>
            <span className="font-medium text-ink">{row.name}</span>
            {row.description ? ` — ${row.description}` : ""}
            {row.price !== null ? ` · ${formatMoneyExact(row.price)}` : ""}
          </li>
        ))}
      </ul>
    </EventOverviewCard>
  );
}
