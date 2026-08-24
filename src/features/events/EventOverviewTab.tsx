import {
  EventDetailRevisePanels,
  type EventDetailRevisePanelsProps,
} from "./EventDetailRevisePanels";
import { EventSetupProgress } from "./EventSetupProgress";
import { EventTimelineCommentsPanel } from "./EventTimelineCommentsPanel";

type EventSetupFlags = {
  hasAssignedClient?: boolean;
  hasExpectedHeadcount?: boolean;
  hasMenuDishes?: boolean;
  hasStaffAssigned?: boolean;
};

type Props = EventDetailRevisePanelsProps & {
  event: EventSetupFlags;
  venue: { name: string } | null | undefined;
  clientId: string;
  clients: readonly ({ _id: string } | null | undefined)[] | undefined;
  stage: string;
};

/** Checklist, summary facts, and date/headcount/venue controls for an event. */
export function EventOverviewTab({
  event,
  venue,
  clientId,
  clients,
  stage,
  startsAt,
  endsAt,
  expectedHeadcount,
  budgetAmount,
  quotedPrice,
  primaryContactName,
  ...reviseProps
}: Props) {
  return (
    <section className="space-y-5" data-testid="event-overview-tab">
      <EventSetupProgress eventId={reviseProps.eventId} event={event} />

      <div id="event-setup-basics" className="scroll-mt-4">
        <EventDetailRevisePanels
          {...reviseProps}
          startsAt={startsAt}
          endsAt={endsAt}
          expectedHeadcount={expectedHeadcount}
          budgetAmount={budgetAmount}
          quotedPrice={quotedPrice}
          primaryContactName={primaryContactName}
        />
      </div>

      <EventTimelineCommentsPanel eventId={reviseProps.eventId} />
    </section>
  );
}
