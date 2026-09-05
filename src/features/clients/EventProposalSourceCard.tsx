import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api, type Id } from "../../lib/api";
import { CLIENTS_ROUTES } from "./clientsRoutes";
import { EventOverviewCard } from "../events/EventOverviewCard";

export function EventProposalSourceCard({
  eventId,
}: {
  eventId: Id<"events">;
}) {
  const booking = useQuery(api.quoteBuilder.getEventBookingDetails, {
    eventId,
  });
  if (!booking) return null;
  return (
    <EventOverviewCard
      title="Booked from proposal"
      testId="event-proposal-source-card"
    >
      <p className="text-sm text-ink-2">
        {booking.canOpenProposal ? (
          <Link
            className="text-link font-medium"
            to={CLIENTS_ROUTES.proposal(booking.proposalId)}
          >
            {booking.label}
          </Link>
        ) : (
          <span className="font-medium text-ink">{booking.label}</span>
        )}
        <span className="text-ink-3">{` · ${booking.revisionLabel}`}</span>
      </p>
    </EventOverviewCard>
  );
}
