import type { Doc, Id } from "../../lib/api";
import { EventBudgetCard } from "./EventBudgetCard";
import {
  EventDetailRevisePanels,
  type EventDetailRevisePanelsProps,
} from "./EventDetailRevisePanels";
import { EventProposalEnhancementsCard } from "../clients/EventProposalEnhancementsCard";
import { EventProposalSourceCard } from "../clients/EventProposalSourceCard";
import { EventDetailsCard } from "./EventDetailsCard";
import { EventInvoiceCard } from "./EventInvoiceCard";
import type {
  EventLifecycleAction,
  EventLifecycleActionKey,
} from "./EventLifecyclePolicy";
import { EventReadinessCard } from "./EventReadinessCard";
import { EventOverviewRail } from "./EventOverviewRail";
import { EventPipelineStageCard } from "./EventPipelineStageCard";
import { EventSetupProgress } from "./EventSetupProgress";
import { EventStageActionsCard } from "./EventStageActionsCard";
import { EventTimelineCommentsPanel } from "./EventTimelineCommentsPanel";
import { EventMapPanel } from "./EventMapPanel";
import { EventWeatherChip } from "./EventWeatherChip";
import { EventReviewFlagsSection } from "./review-flags/EventReviewFlagsSection";
import { EventPacketPanel } from "./packet/EventPacketPanel";
import { EventImportDraftPanel } from "./import/EventImportDraftPanel";
import { eventDetailPath } from "./eventRoutes";
import "./EventOverview.css";

/** The slice of the Event document the overview reads directly. */
type OverviewEvent = {
  hasAssignedClient?: boolean;
  hasExpectedHeadcount?: boolean;
  hasMenuDishes?: boolean;
  hasStaffAssigned?: boolean;
  eventType: string;
  clientName?: string | null;
  venueId?: Id<"venues"> | null;
  venueName?: string | null;
  venueAddress?: string | null;
  occasionId?: Id<"occasions"> | null;
  occasionName?: string | null;
  serviceStyleId?: Id<"serviceStyles"> | null;
  serviceStyleName?: string | null;
  referralSourceId?: Id<"referralSources"> | null;
  assignedToId?: Id<"people"> | null;
  ownerName?: string | null;
};

type OwnerPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  role: string;
};

type Props = EventDetailRevisePanelsProps & {
  event: OverviewEvent;
  venue: Doc<"venues"> | null | undefined;
  clientId?: string | null;
  clients: Doc<"clients">[] | undefined;
  stage: string;
  currencyCode: string;
  lifecycleActions: readonly EventLifecycleAction[];
  onAction: (key: EventLifecycleActionKey) => void;
  people: readonly OwnerPerson[] | undefined;
  dishCount: number;
  staffCount: number;
  timelineCount: number;
};

/**
 * Overview layout, in priority order: where the event sits (pipeline, stage
 * moves, review flags), what it is (details), where it is (venue map with the
 * event-day weather chip riding in the header), the money surface, then the
 * workflow packet. Readiness, ownership, and counts hold the rail — they fold
 * under the main column below 1280px and on phones. Edit forms sit below the
 * read surface, anchored at `#event-setup-basics`, so every "Edit" link on
 * the page lands on them.
 */
export function EventOverviewTab({
  event,
  venue,
  clientId,
  clients,
  stage,
  currencyCode,
  lifecycleActions,
  onAction,
  people,
  dishCount,
  staffCount,
  timelineCount,
  startsAt,
  endsAt,
  expectedHeadcount,
  budgetAmount,
  quotedPrice,
  primaryContactName,
  ...reviseProps
}: Props) {
  const eventId = reviseProps.eventId;
  const editHref = `${eventDetailPath(eventId, "overview")}#event-setup-basics`;

  return (
    <section className="space-y-5" data-testid="event-overview-tab">
      <div className="event-overview-grid">
        <div className="event-overview-main">
          <EventPipelineStageCard stage={stage} />
          <EventStageActionsCard
            actions={lifecycleActions}
            busy={reviseProps.busy}
            onAction={onAction}
          />
          <EventReviewFlagsSection eventId={eventId} />
          <EventDetailsCard
            clientId={clientId}
            clients={clients}
            clientName={event.clientName}
            clientsLoading={clients === undefined}
            eventType={event.eventType}
            startsAt={startsAt}
            endsAt={endsAt}
            expectedHeadcount={expectedHeadcount}
            venue={venue}
            venueId={event.venueId}
            venueName={event.venueName}
            venuesLoading={reviseProps.venuesLoading}
            venueAddress={event.venueAddress}
            occasionId={event.occasionId}
            occasionName={event.occasionName}
            serviceStyleId={event.serviceStyleId}
            serviceStyleName={event.serviceStyleName}
            referralSourceId={event.referralSourceId}
            primaryContactName={primaryContactName}
            primaryContactEmail={reviseProps.primaryContactEmail}
            accessibilityNeeds={reviseProps.accessibilityNeeds}
            editHref={editHref}
          />
          <EventMapPanel venue={venue} startsAt={startsAt}>
            <EventWeatherChip venue={venue} startsAt={startsAt} />
          </EventMapPanel>
          <EventBudgetCard
            budgetAmount={budgetAmount}
            quotedPrice={quotedPrice}
            currencyCode={currencyCode}
            marginHref={eventDetailPath(eventId, "margin")}
            locked={!reviseProps.canRevise}
          />
          <EventInvoiceCard eventId={eventId} currencyCode={currencyCode} />
          <EventImportDraftPanel eventId={eventId} />
          <EventPacketPanel eventId={eventId} />
          <EventProposalSourceCard eventId={eventId} />
          <EventProposalEnhancementsCard eventId={eventId} />
        </div>

        <div className="event-overview-rail">
          <EventReadinessCard eventId={eventId} />
          <EventSetupProgress eventId={eventId} event={event} />
          <EventOverviewRail
            assignedToId={event.assignedToId}
            ownerName={event.ownerName}
            people={people}
            peopleLoading={people === undefined}
            dishCount={dishCount}
            staffCount={staffCount}
            timelineCount={timelineCount}
            operationalRequirements={reviseProps.operationalRequirements}
            menuHref={eventDetailPath(eventId, "menu")}
            staffingHref={eventDetailPath(eventId, "staffing")}
            timelineHref={eventDetailPath(eventId, "timeline")}
            editHref={editHref}
          />
        </div>
      </div>

      <div id="event-setup-basics" className="scroll-mt-4">
        <EventDetailRevisePanels
          {...reviseProps}
          startsAt={startsAt}
          endsAt={endsAt}
          expectedHeadcount={expectedHeadcount}
          budgetAmount={budgetAmount}
          quotedPrice={quotedPrice}
          primaryContactName={primaryContactName}
          serviceStyleId={event.serviceStyleId}
        />
      </div>

      <EventTimelineCommentsPanel eventId={eventId} />
    </section>
  );
}
