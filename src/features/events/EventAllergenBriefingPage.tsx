import { Link, useParams } from "react-router-dom";
import { useGetEvent } from "../../lib/manifest-convex-react";
import { formatCountNoun, formatDate, formatTime } from "../../lib/format";
import { useRouteRecord } from "../../lib/routeRecord";
import { ErrorState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { EventAllergenBriefingBody } from "./EventAllergenBriefingBody";
import { eventDetailPath } from "./eventRoutes";
// ponytail: browser print → "Save as PDF"; same approach as ContractDocumentPage.
import "./EventAllergenBriefingPage.css";

/** Print-ready allergen briefing for the front-of-house pre-event huddle. */
export function EventAllergenBriefingPage() {
  const { id } = useParams<{ id: string }>();
  const event = useRouteRecord(useGetEvent, id);

  if (!id) {
    return (
      <ErrorState
        title="Event not found"
        detail="This link doesn't point to an event. Open the event again from the events list."
      />
    );
  }
  if (event === undefined) {
    return (
      <div className="operations-stage supply-stage">
        <TableSkeleton rows={6} />
      </div>
    );
  }
  if (event === null || event.deletedAt != null) {
    return (
      <ErrorState
        title="Event unavailable"
        detail="It may have been deleted, or you may not have access to it."
      />
    );
  }

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead briefing-no-print">
        <div>
          <p className="eyebrow">Events · Allergen briefing</p>
          <h1 className="display-title mt-2">Allergen briefing</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Print this sheet for the pre-event staff huddle. It lists every dish
            on the menu with its allergens, plus guest dietary restrictions
            captured at booking.
          </p>
        </div>
        <div className="supply-row-actions">
          <Link className="btn btn-ghost" to={eventDetailPath(id)}>
            Back to event
          </Link>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => window.print()}
          >
            Print briefing
          </button>
        </div>
      </header>

      <article className="briefing-document mx-auto mt-6 max-w-200 p-8">
        <header className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Allergen briefing · {event.title}
            </h1>
            <p className="mt-1 text-base text-ink-2">
              {event.startsAt != null
                ? `${formatDate(event.startsAt)} ${formatTime(event.startsAt)}`
                : "Date TBD"}
              {event.venueName ? ` · ${event.venueName}` : ""}
              {event.expectedHeadcount != null
                ? ` · ${formatCountNoun(event.expectedHeadcount, "guest")} expected`
                : ""}
            </p>
          </div>
          <StatusChip status={String(event.stage)} />
        </header>

        <EventAllergenBriefingBody
          eventId={event._id}
          expectedHeadcount={event.expectedHeadcount}
        />
        <footer className="mt-8 border-t border-line-2 pt-2 text-xs text-ink-2">
          Generated from Capsule · Event ref {event._id} · Review together at
          the pre-event huddle before service.
        </footer>
      </article>
    </div>
  );
}
