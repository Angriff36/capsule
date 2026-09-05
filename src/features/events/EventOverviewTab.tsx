import type { Doc, Id } from "../../lib/api";
import { EventBudgetCard } from "./EventBudgetCard";
import {
  EventDetailRevisePanels,
  type EventDetailRevisePanelsProps,
} from "./EventDetailRevisePanels";
import { EventProposalEnhancementsCard } from "../clients/EventProposalEnhancementsCard";
import { EventDetailsCard } from "./EventDetailsCard";
import type {
  EventLifecycleAction,
  EventLifecycleActionKey,
} from "./EventLifecyclePolicy";
import { EventOverviewRail } from "./EventOverviewRail";
import { EventPipelineStageCard } from "./EventPipelineStageCard";
import { EventSetupProgress } from "./EventSetupProgress";
import { EventStageActionsCard } from "./EventStageActionsCard";
import { EventTimelineCommentsPanel } from "./EventTimelineCommentsPanel";
import { EventWeatherPanel } from "./EventWeatherPanel";
import { eventDetailPath } from "./eventRoutes";
import "./EventOverview.css";

/** The slice of the Event document the overview reads directly. */
type OverviewEvent = {
  hasAssignedClient?: boolean;
  hasExpectedHeadcount?: boolean;
  hasMenuDishes?: boolean;
  hasStaffAssigned?: boolean;
  eventType: string;
  venueAddress?: string | null;
  occasionId?: Id<"occasions"> | null;
  serviceStyleId?: Id<"serviceStyles"> | null;
  referralSourceId?: Id<"referralSources"> | null;
  assignedToId?: Id<"people"> | null;
  recurrenceFrequency?: string | null;
  recurrenceNextStartsAt?: number | null;
  recurrenceGeneratedCount?: number | null;
  recurrenceActive?: boolean | null;
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
  clientId: string;
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
 * Overview layout: pipeline, stage moves, standing facts, money, and weather
 * down the main column; readiness, ownership, counts, recurrence, and standing
 * instructions in the rail. Edit forms sit below the read surface, anchored at
 * `#event-setup-basics` so every "Edit" link on the page lands on them.
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
          <EventDetailsCard
            clientId={clientId}
            clients={clients}
            eventType={event.eventType}
            startsAt={startsAt}
            endsAt={endsAt}
            expectedHeadcount={expectedHeadcount}
            venue={venue}
            venueAddress={event.venueAddress}
            occasionId={event.occasionId}
            serviceStyleId={event.serviceStyleId}
            referralSourceId={event.referralSourceId}
            primaryContactName={primaryContactName}
            primaryContactEmail={reviseProps.primaryContactEmail}
            accessibilityNeeds={reviseProps.accessibilityNeeds}
            editHref={editHref}
          />
          <EventProposalEnhancementsCard eventId={eventId} />
          <EventBudgetCard
            budgetAmount={budgetAmount}
            quotedPrice={quotedPrice}
            currencyCode={currencyCode}
            marginHref={eventDetailPath(eventId, "margin")}
            locked={!reviseProps.canRevise}
          />
          <EventWeatherPanel venue={venue} />
        </div>

        <div className="event-overview-rail">
          <EventSetupProgress eventId={eventId} event={event} />
          <EventOverviewRail
            assignedToId={event.assignedToId}
            people={people}
            dishCount={dishCount}
            staffCount={staffCount}
            timelineCount={timelineCount}
            recurrenceFrequency={event.recurrenceFrequency}
            recurrenceNextStartsAt={event.recurrenceNextStartsAt}
            recurrenceGeneratedCount={event.recurrenceGeneratedCount}
            recurrenceActive={event.recurrenceActive}
            operationalRequirements={reviseProps.operationalRequirements}
            menuHref={eventDetailPath(eventId, "menu")}
            staffingHref={eventDetailPath(eventId, "staffing")}
            timelineHref={eventDetailPath(eventId, "timeline")}
            recurringHref={eventDetailPath(eventId, "recurring")}
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
        />
      </div>

      <EventTimelineCommentsPanel eventId={eventId} />
    </section>
  );
}
