import { Link } from "react-router-dom";
import { formatCount, formatDate } from "../../../lib/format";
import { formatStatusLabel } from "../../../lib/statusLabels";
import { EventBudgetCard } from "../EventBudgetCard";
import { EventDetailRevisePanels } from "../EventDetailRevisePanels";
import { EventDetailsCard } from "../EventDetailsCard";
import { EventInvoiceCard } from "../EventInvoiceCard";
import { EventMapPanel } from "../EventMapPanel";
import { EventOverviewRail } from "../EventOverviewRail";
import { EventReadinessCard } from "../EventReadinessCard";
import { EventSetupProgress } from "../EventSetupProgress";
import { EventStageActionsCard } from "../EventStageActionsCard";
import { EventTimelineCommentsPanel } from "../EventTimelineCommentsPanel";
import { EventWeatherChip } from "../EventWeatherChip";
import { eventDetailPath } from "../eventRoutes";
import { STAGE_LABEL, type EventStage } from "../eventStatus";
import { EventPacketPanel } from "../packet/EventPacketPanel";
import { EventReviewFlagsSection } from "../review-flags/EventReviewFlagsSection";
import { allergyLine } from "./eventDashFacts";
import { EventDashSheetHead } from "./EventDashSheet";
import type { DashSheetId, EventDashOverviewProps } from "./eventDashTypes";

export const SHEET_LABEL: Record<DashSheetId, string> = {
  details: "Event details",
  ready: "Setup readiness",
  money: "Budget & invoicing",
  service: "Service & allergies",
  workbook: "Event workbook",
  ops: "Operations",
  weather: "Weather",
  team: "Owner & staff",
  recurring: "Recurring schedule",
  notes: "Planning notes",
  stage: "Pipeline stage",
  edit: "Edit event basics",
};

/** The body of one sheet, built from the app's working cards and forms. */
export function EventDashSheetBody({
  id,
  props,
  title,
  onOpen,
}: {
  readonly id: DashSheetId;
  readonly props: EventDashOverviewProps;
  readonly title: string;
  readonly onOpen: (id: DashSheetId) => void;
}) {
  const {
    event,
    eventId,
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
  } = props;
  const editHref = `${eventDetailPath(eventId, "overview")}#event-setup-basics`;
  const editButton = (
    <div className="evd-center">
      <button type="button" className="evd-btn" onClick={() => onOpen("edit")}>
        Edit requirements
      </button>
    </div>
  );

  switch (id) {
    case "details":
      return (
        <>
          <EventDashSheetHead
            kicker="Event details"
            title={title}
            lede="The booking at a glance."
          />
          <div className="evd-sheet-body">
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
            <div className="evd-center">
              <button
                type="button"
                className="evd-btn pri"
                onClick={() => onOpen("edit")}
              >
                Edit event basics
              </button>
            </div>
          </div>
        </>
      );
    case "ready":
      return (
        <>
          <EventDashSheetHead
            kicker="Setup readiness"
            title="Before approval"
            lede="Complete each item before approval. Live readiness by area is below."
          />
          <div className="evd-sheet-body">
            <EventSetupProgress eventId={eventId} event={event} />
            <EventReadinessCard eventId={eventId} />
          </div>
        </>
      );
    case "money":
      return (
        <>
          <EventDashSheetHead
            kicker="Budget & pricing"
            title="Money"
            lede="Budget, quoted price, and the invoice for this event."
          />
          <div className="evd-sheet-body">
            <EventBudgetCard
              budgetAmount={budgetAmount}
              quotedPrice={quotedPrice}
              currencyCode={currencyCode}
              marginHref={eventDetailPath(eventId, "margin")}
              locked={!reviseProps.canRevise}
            />
            <EventInvoiceCard eventId={eventId} currencyCode={currencyCode} />
          </div>
        </>
      );
    case "service": {
      const allergy = allergyLine(reviseProps.serviceRequirements);
      return (
        <>
          <EventDashSheetHead
            kicker="Service notes"
            title="Service & allergies"
            lede="The kitchen and floor team must read this before the event."
          />
          <div className="evd-sheet-body">
            {allergy ? (
              <div className="evd-note crit">
                <span className="evd-label">Allergies — read first</span>
                {allergy}
              </div>
            ) : null}
            <div className="evd-note">
              <span className="evd-label">Service requirements</span>
              {reviseProps.serviceRequirements?.trim() ||
                "No service requirements on file."}
            </div>
            <div className="evd-note">
              <span className="evd-label">Accessibility</span>
              {reviseProps.accessibilityNeeds?.length
                ? reviseProps.accessibilityNeeds.join(", ")
                : "No accessibility notes."}
            </div>
            <div className="evd-center">
              <Link
                to={`/events/${eventId}/allergen-briefing`}
                className="evd-btn"
              >
                Allergen briefing
              </Link>
              <button
                type="button"
                className="evd-btn"
                onClick={() => onOpen("edit")}
              >
                Edit requirements
              </button>
            </div>
          </div>
        </>
      );
    }
    case "workbook":
      return (
        <>
          <EventDashSheetHead kicker="Event workbook" title="Workbook" />
          <EventPacketPanel eventId={eventId} />
        </>
      );
    case "ops":
      return (
        <>
          <EventDashSheetHead
            kicker="Operational requirements"
            title="Operations"
            lede="Travel, pack list, site setup, and strike."
          />
          <div className="evd-sheet-body">
            <div className="evd-note">
              <span className="evd-label">Operations</span>
              {reviseProps.operationalRequirements?.trim() ||
                "No operational requirements on file."}
            </div>
            {editButton}
          </div>
        </>
      );
    case "weather":
      return (
        <>
          <EventDashSheetHead
            kicker="Weather forecast"
            title="Event-day outlook"
            lede="The venue's forecast for the event date. Add a venue address or coordinates to see it."
          />
          <div className="evd-sheet-body">
            <div className="evd-center">
              <EventWeatherChip venue={venue} startsAt={startsAt} />
            </div>
            <EventMapPanel venue={venue} startsAt={startsAt} />
          </div>
        </>
      );
    case "team":
      return (
        <>
          <EventDashSheetHead
            kicker="Owner & staff"
            title="The team"
            lede="Who owns this event and who works it."
          />
          <div className="evd-sheet-body">
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
            <div className="evd-center">
              <Link
                to={eventDetailPath(eventId, "staffing")}
                className="evd-btn pri"
              >
                Assign staff
              </Link>
            </div>
          </div>
        </>
      );
    case "recurring":
      return (
        <>
          <EventDashSheetHead
            kicker="Recurring schedule"
            title={
              event.recurrenceFrequency
                ? formatStatusLabel(event.recurrenceFrequency)
                : "One-time event"
            }
            lede={
              event.recurrenceFrequency
                ? "This event repeats."
                : "This event does not repeat."
            }
          />
          <div className="evd-sheet-body">
            <div className="evd-figs">
              <div>
                <b>{formatCount(event.recurrenceGeneratedCount ?? 0)}</b>
                <span className="evd-label">Occurrences</span>
              </div>
              <div>
                <b>
                  {event.recurrenceFrequency
                    ? formatStatusLabel(event.recurrenceFrequency)
                    : "Never"}
                </b>
                <span className="evd-label">Repeats</span>
              </div>
              <div>
                <b>{event.recurrenceActive ? "On" : "—"}</b>
                <span className="evd-label">Schedule</span>
              </div>
            </div>
            <div className="evd-center">
              <Link
                to={eventDetailPath(eventId, "recurring")}
                className="evd-btn pri"
              >
                {event.recurrenceFrequency
                  ? "Open the schedule"
                  : "Set up a schedule"}
              </Link>
            </div>
          </div>
        </>
      );
    case "notes":
      return (
        <>
          <EventDashSheetHead
            kicker="Planning notes"
            title="Notes"
            lede="Day-level notes that stay with the plan. Live crew conversation is in Team Chat."
          />
          <EventTimelineCommentsPanel eventId={eventId} />
        </>
      );
    case "stage":
      return (
        <>
          <EventDashSheetHead
            kicker="Pipeline stage"
            title={STAGE_LABEL[stage as EventStage] ?? formatStatusLabel(stage)}
            lede={
              startsAt != null
                ? `Event date ${formatDate(startsAt)}`
                : undefined
            }
          />
          <div className="evd-sheet-body">
            <EventStageActionsCard
              actions={lifecycleActions}
              busy={reviseProps.busy}
              onAction={onAction}
            />
            <EventReviewFlagsSection eventId={eventId} />
          </div>
        </>
      );
    case "edit":
      return (
        <>
          <EventDashSheetHead
            kicker="Edit event basics"
            title={title}
            lede="Update schedule, headcount, venue, pricing, contact, and planning notes for this event."
          />
          <div id="event-setup-basics">
            <EventDetailRevisePanels
              {...reviseProps}
              eventId={eventId}
              startsAt={startsAt}
              endsAt={endsAt}
              expectedHeadcount={expectedHeadcount}
              budgetAmount={budgetAmount}
              quotedPrice={quotedPrice}
              primaryContactName={primaryContactName}
              serviceStyleId={event.serviceStyleId}
            />
          </div>
        </>
      );
  }
}
