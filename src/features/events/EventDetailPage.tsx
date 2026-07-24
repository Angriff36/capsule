import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { Id } from "../../lib/api";
import { relativeDays } from "../../lib/format";
import {
  useEventApprove,
  useEventBeginExecution,
  useEventCancel,
  useEventChangeHeadcount,
  useEventChangePricing,
  useEventChangePrimaryContact,
  useEventChangeRequirements,
  useEventChangeVenue,
  useEventCloseOut,
  useEventComplete,
  useEventReschedule,
  useEventReturnToPlanning,
  useEventSubmitForApproval,
  useGetEvent,
  useListClient,
  useListDish,
  useListEventAssignment,
  useListEventDish,
  useListEventTimelineActivity,
  useListPerson,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { useTrackRecent } from "../../lib/recents";
import { ArrowLeftIcon } from "../../ui/icons";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { ErrorState, PageHeader, StatusChip } from "../../ui/primitives";
import { useTenantBranding } from "../admin/tenantBranding";
import { EventClientPortalShare } from "../clientPortal/EventClientPortalShare";
import { ClientPreviewCard } from "../clients/ClientPreviewCard";
import { HoverPreview } from "../../ui/HoverPreview";
import { downloadBeoPdf } from "./beoPdf";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { clientDisplayName } from "./clientName";
import { EventClientTab } from "./EventClientTab";
import { EventDetailTabs } from "./EventDetailTabs";
import { EventEquipmentPanel } from "./EventEquipmentPanel";
import {
  type EventLifecycleActionKey,
  eventLifecyclePolicy,
} from "./EventLifecyclePolicy";
import { EventMarginTab } from "./EventMarginTab";
import { EventMenuTab } from "./EventMenuTab";
import { EventOverviewTab } from "./EventOverviewTab";
import { EventPhotosTab } from "./EventPhotosTab";
import { EventStaffingTab } from "./EventStaffingTab";
import { EventTabErrorBoundary } from "./EventTabErrorBoundary";
import { EventWeatherPanel } from "./EventWeatherPanel";
import { EventLayoutsTab } from "./EventLayoutsTab";
import { EventTimelineTab } from "./EventTimelineTab";
import { FailureBanner } from "./FailureBanner";
import { RecurringEventPanel } from "./RecurringEventPanel";
import { type EventDetailTab, parseEventDetailTab } from "./eventRoutes";

export function EventDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseEventDetailTab(searchParams.get("tab"));
  const eventId = (id ?? "skip") as Id<"events"> | "skip";
  const event = useGetEvent(eventId);
  const clients = useListClient();
  useTrackRecent("Event", event?.title);
  const dishes = useListDish();
  const eventAssignments = useListEventAssignment();
  const eventDishes = useListEventDish();
  const timelineActivities = useListEventTimelineActivity();
  const people = useListPerson();
  const venues = useListVenue();
  const { branding } = useTenantBranding();
  const submitForApproval = useEventSubmitForApproval();
  const approve = useEventApprove();
  const beginExecution = useEventBeginExecution();
  const complete = useEventComplete();
  const closeOut = useEventCloseOut();
  const cancel = useEventCancel();
  const returnToPlanning = useEventReturnToPlanning();
  const changeHeadcount = useEventChangeHeadcount();
  const changePricing = useEventChangePricing();
  const changePrimaryContact = useEventChangePrimaryContact();
  const changeRequirements = useEventChangeRequirements();
  const changeVenue = useEventChangeVenue();
  const reschedule = useEventReschedule();
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [reasonFor, setReasonFor] = useState<
    "cancel" | "returnToPlanning" | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const { loadingTooLong } = useSlowQuery(event);

  if (event === undefined) {
    return (
      <QueryLoadState
        title="Event data is not loading"
        detail="The workspace did not return this event. Check the session or backend connection, then retry."
        loadingTooLong={loadingTooLong}
      />
    );
  }
  if (event === null || event.deletedAt != null) {
    return (
      <ErrorState
        title="Event unavailable"
        detail="It may not exist, may have been deleted, or your role may not permit access."
        onRetry={() => window.location.reload()}
      />
    );
  }

  const version = typeof event.version === "number" ? event.version : undefined;
  const canRevise = eventLifecyclePolicy.isEditableStage(String(event.stage));
  const canChangeHeadcount = eventLifecyclePolicy.canChangeHeadcount(
    String(event.stage),
  );
  const reviseBlockedReason = canRevise
    ? undefined
    : `Planning revisions are disabled while the event is ${String(event.stage).replaceAll("_", " ")}.`;
  const headcountBlockedReason = canChangeHeadcount
    ? undefined
    : `Headcount changes are not permitted while the event is ${String(event.stage).replaceAll("_", " ")}.`;
  const activeVenues = (venues ?? []).filter(
    (venue) =>
      venue.status === "active" &&
      venue.registeredAt != null &&
      venue.deletedAt == null,
  );
  const venue = venues?.find((row) => row._id === event.venueId);

  const setTab = (tab: EventDetailTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const run = async (work: () => Promise<unknown>) => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      setReasonFor(null);
      setReason("");
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(false);
    }
  };

  const runAction = (key: EventLifecycleActionKey) => {
    if (key === "cancel" || key === "returnToPlanning") {
      setReasonFor(key);
      setReason("");
      return;
    }
    const args = { docId: event._id, version };
    if (key === "submitForApproval") void run(() => submitForApproval(args));
    if (key === "approve") void run(() => approve(args));
    if (key === "beginExecution") void run(() => beginExecution(args));
    if (key === "complete") void run(() => complete(args));
    if (key === "closeOut") void run(() => closeOut(args));
  };

  return (
    <div className="space-y-4">
      <Link
        to="/events"
        className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink"
      >
        <ArrowLeftIcon width={12} height={12} /> All events
      </Link>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            {event.title}
            <StatusChip status={String(event.stage)} />
          </span>
        }
        lead={
          <span className="font-mono text-[12px]">
            {event.eventType} ·{" "}
            {(() => {
              const client = clients?.find((c) => c._id === event.clientId);
              const name = clientDisplayName(event.clientId, clients);
              if (!client) return name;
              return (
                <HoverPreview card={<ClientPreviewCard client={client} />}>
                  <Link
                    to={`/clients/${client._id}`}
                    className="underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    {name}
                  </Link>
                </HoverPreview>
              );
            })()}
            {venue ? (
              <>
                {" · "}
                <Link
                  to="/facilities"
                  className="underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  {venue.name}
                </Link>
              </>
            ) : null}
            {event.startsAt != null ? ` · ${relativeDays(event.startsAt)}` : ""}
          </span>
        }
        actions={[
          <EventClientPortalShare
            key="client-portal-share"
            eventId={event._id}
          />,
          <button
            key="download-beo"
            type="button"
            className="btn btn-ghost"
            disabled={
              busy ||
              clients === undefined ||
              dishes === undefined ||
              eventAssignments === undefined ||
              eventDishes === undefined ||
              people === undefined ||
              timelineActivities === undefined
            }
            onClick={() => {
              setPdfNotice(null);
              void downloadBeoPdf({
                event,
                clientName: clientDisplayName(event.clientId, clients),
                dishes: (eventDishes ?? [])
                  .filter(
                    (selection) =>
                      selection.deletedAt == null &&
                      selection.removedAt == null &&
                      selection.eventId === event._id,
                  )
                  .map((selection) => ({
                    selection,
                    dish: dishes?.find((dish) => dish._id === selection.dishId),
                  })),
                timeline: (timelineActivities ?? []).filter(
                  (activity) =>
                    activity.eventId === event._id &&
                    activity.scheduledAt != null &&
                    activity.deletedAt == null,
                ),
                staff: (eventAssignments ?? [])
                  .filter(
                    (assignment) =>
                      assignment.deletedAt == null &&
                      assignment.eventId === event._id &&
                      assignment.status !== "unassigned",
                  )
                  .map((assignment) => ({
                    assignment,
                    person: people?.find(
                      (person) => person._id === assignment.personId,
                    ),
                  })),
                branding,
              })
                .then(() => setPdfNotice("BEO PDF downloaded."))
                .catch((error) => setFailure(classifyCommandFailure(error)));
            }}
          >
            Download BEO
          </button>,
          <Link
            key="save-as-template"
            className="btn btn-ghost"
            to={`/events/templates?fromEvent=${event._id}`}
          >
            Save as template
          </Link>,
          <Link
            key="allergen-briefing"
            className="btn btn-ghost"
            to={`/events/${event._id}/allergen-briefing`}
          >
            Allergen briefing
          </Link>,
          ...eventLifecyclePolicy
            .availableActions(String(event.stage))
            .map((action) => (
              <button
                key={action.key}
                type="button"
                disabled={busy}
                onClick={() => runAction(action.key)}
                className={`btn ${action.kind === "primary" ? "btn-primary" : action.kind === "danger" ? "btn-danger" : "btn-ghost"}`}
              >
                {action.label}
              </button>
            )),
        ]}
      />

      {pdfNotice ? (
        <p className="text-[13px] text-ink-2" role="status">
          {pdfNotice}
        </p>
      ) : null}

      {reasonFor ? (
        <form
          className="card flex flex-wrap items-end gap-2 border-warn/40 bg-warn-soft/50 px-3 py-3"
          onSubmit={(formEvent) => {
            formEvent.preventDefault();
            if (!reason.trim()) return;
            if (reasonFor === "cancel")
              void run(() =>
                cancel({ docId: event._id, reason: reason.trim(), version }),
              );
            else
              void run(() =>
                returnToPlanning({
                  docId: event._id,
                  reason: reason.trim(),
                  version,
                }),
              );
          }}
        >
          <label className="field-label min-w-0 flex-1 basis-48">
            {reasonFor === "cancel"
              ? "Reason for cancelling"
              : "Reason for returning to planning"}
            <input
              autoFocus
              value={reason}
              onChange={(inputEvent) => setReason(inputEvent.target.value)}
              className="input"
              required
            />
          </label>
          <button
            type="submit"
            disabled={busy || !reason.trim()}
            className={
              reasonFor === "cancel" ? "btn btn-danger" : "btn btn-primary"
            }
          >
            Confirm
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setReasonFor(null)}
          >
            Dismiss
          </button>
        </form>
      ) : null}
      {failure ? <FailureBanner failure={failure} /> : null}

      <EventDetailTabs active={activeTab} onChange={setTab} />

      {activeTab === "overview" ? (
        <EventTabErrorBoundary tabLabel="Overview" key="overview">
          <EventOverviewTab
            eventId={event._id}
            event={event}
            version={version}
            busy={busy}
            canRevise={canRevise}
            canChangeHeadcount={canChangeHeadcount}
            reviseBlockedReason={reviseBlockedReason}
            headcountBlockedReason={headcountBlockedReason}
            venuesLoading={venues === undefined}
            activeVenues={activeVenues}
            venue={venue}
            clients={clients}
            clientId={event.clientId}
            startsAt={event.startsAt}
            endsAt={event.endsAt}
            expectedHeadcount={event.expectedHeadcount}
            venueId={event.venueId}
            budgetAmount={event.budgetAmount}
            quotedPrice={event.quotedPrice}
            primaryContactName={event.primaryContactName}
            primaryContactEmail={event.primaryContactEmail}
            primaryContactPhone={event.primaryContactPhone}
            accessibilityNeeds={event.accessibilityNeeds}
            serviceRequirements={event.serviceRequirements}
            operationalRequirements={event.operationalRequirements}
            stage={String(event.stage)}
            run={run}
            onReschedule={reschedule}
            onChangeHeadcount={changeHeadcount}
            onChangeVenue={changeVenue}
            onChangePricing={changePricing}
            onChangePrimaryContact={changePrimaryContact}
            onChangeRequirements={changeRequirements}
          />
          <div className="mt-4">
            <EventWeatherPanel venue={venue} />
          </div>
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "menu" ? (
        <EventTabErrorBoundary tabLabel="Menu" key="menu">
          <EventMenuTab
            eventId={event._id}
            expectedHeadcount={Number(event.expectedHeadcount) || 0}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "equipment" ? (
        <EventTabErrorBoundary tabLabel="Equipment" key="equipment">
          <EventEquipmentPanel
            eventId={event._id}
            startsAt={event.startsAt}
            endsAt={event.endsAt}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "client" ? (
        <EventTabErrorBoundary tabLabel="Client Information" key="client">
          <EventClientTab
            eventId={event._id}
            eventTitle={event.title}
            clientId={event.clientId}
            primaryContactName={event.primaryContactName}
            primaryContactEmail={event.primaryContactEmail}
            primaryContactPhone={event.primaryContactPhone}
            accessibilityNeeds={event.accessibilityNeeds}
            serviceRequirements={event.serviceRequirements}
            operationalRequirements={event.operationalRequirements}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "photos" ? (
        <EventTabErrorBoundary tabLabel="Event Photo Gallery" key="photos">
          <EventPhotosTab eventId={event._id} />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "timeline" ? (
        <EventTabErrorBoundary tabLabel="Timeline" key="timeline">
          <EventTimelineTab eventId={event._id} startsAt={event.startsAt} />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "layouts" ? (
        <EventTabErrorBoundary tabLabel="Layouts" key="layouts">
          <EventLayoutsTab eventId={event._id} />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "recurring" ? (
        <EventTabErrorBoundary tabLabel="Recurring Schedule" key="recurring">
          <RecurringEventPanel
            eventId={event._id}
            startsAt={event.startsAt}
            version={version}
            canConfigure={canRevise}
            recurrenceFrequency={event.recurrenceFrequency}
            recurrenceEndCondition={event.recurrenceEndCondition}
            recurrenceEndsAt={event.recurrenceEndsAt}
            recurrenceOccurrenceLimit={event.recurrenceOccurrenceLimit}
            recurrenceNextStartsAt={event.recurrenceNextStartsAt}
            recurrenceGeneratedCount={event.recurrenceGeneratedCount}
            recurrenceActive={event.recurrenceActive}
            recurrenceStoppedAt={event.recurrenceStoppedAt}
            recurrenceCompletedAt={event.recurrenceCompletedAt}
            recurrenceTemplateEventId={event.recurrenceTemplateEventId}
            recurrenceSequence={event.recurrenceSequence}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "staffing" ? (
        <EventTabErrorBoundary tabLabel="Staffing" key="staffing">
          <EventStaffingTab
            eventId={event._id}
            startsAt={event.startsAt}
            endsAt={event.endsAt}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "margin" ? (
        <EventTabErrorBoundary tabLabel="Margin" key="margin">
          <EventMarginTab eventId={event._id} />
        </EventTabErrorBoundary>
      ) : null}
    </div>
  );
}
