import {
  EventDetailRevisePanels,
  type EventDetailRevisePanelsProps,
} from "./EventDetailRevisePanels";
import { EventDetailSummaryFacts } from "./EventDetailSummaryFacts";
import { EventSetupProgress } from "./EventSetupProgress";
import { EventTabIntro } from "./EventTabIntro";
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
    <section className="space-y-4" data-testid="event-overview-tab">
      <EventTabIntro
        title="Overview"
        description="See setup readiness, event facts, staff discussion, and edit schedule, headcount, venue, and contacts."
      />

      <EventSetupProgress eventId={reviseProps.eventId} event={event} />

      <EventDetailSummaryFacts
        startsAt={startsAt}
        endsAt={endsAt}
        expectedHeadcount={expectedHeadcount}
        budgetAmount={budgetAmount}
        quotedPrice={quotedPrice}
        venue={venue}
        clientId={clientId}
        clients={clients}
        primaryContactName={primaryContactName}
        stage={stage}
      />

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
