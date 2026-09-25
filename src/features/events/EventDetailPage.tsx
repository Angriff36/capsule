import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMobileViewport } from "../../app/shell/useMobileViewport";
import { normalizeCurrencyCode } from "../../lib/format";
import { useHeldQueryRows } from "../../lib/heldQueryRows";
import { useRouteRecord } from "../../lib/routeRecord";
import {
  useEventApprove,
  useEventArchive,
  useEventBeginExecution,
  useEventCancel,
  useEventChangeHeadcount,
  useEventChangePricing,
  useEventChangePrimaryContact,
  useEventChangeRequirements,
  useEventChangeVenue,
  useEventCloseOut,
  useEventComplete,
  useEventConfirmSalesLock,
  useEventFinalizeEvent,
  useEventLockForSales,
  useEventReschedule,
  useEventReturnToPlanning,
  useEventSubmitForApproval,
  useGetEvent,
  useListClient,
  useListOrganization,
  useListDish,
  useListEventDish,
  useListEventTimelineActivity,
  useListPerson,
  useListVenue,
} from "../../lib/manifest-convex-react";
import {
  useEventAssignmentRows,
  useEventShiftRows,
  useEventStaffNeedRows,
} from "../../lib/eventScopedQueries";
import { useTrackRecent } from "../../lib/recents";
import { DownloadIcon } from "../../ui/icons";
import { eventVenueLabel } from "./eventVenueLabel";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { ActionMenu, ActionMenuRule, ErrorState } from "../../ui/primitives";
import { reportActionOk } from "../../ui/action-result";
import { useSuccessToast } from "../../ui/useSuccessToast";
import { useTenantBranding } from "../admin/tenantBranding";
import { EventChatTab } from "../chat/EventChatTab";
import { EventClientPortalShare } from "../clientPortal/EventClientPortalShare";
import { ClientPreviewCard } from "../clients/ClientPreviewCard";
import { HoverPreview } from "../../ui/HoverPreview";
import { downloadBeoPdf } from "./beoPdf";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { clientDisplayName } from "./clientName";
import { EventClientTab } from "./EventClientTab";
import { EventArchiveMenuItems } from "./EventArchiveMenuItems";
import { EventDuplicateMenuItem } from "./EventDuplicateMenuItem";
import { EventDashboard } from "./dashboard/EventDashboard";
import { EventEquipmentPanel } from "./EventEquipmentPanel";
import { EventGuestPanel } from "./EventGuestPanel";
import { EventIncidentPanel } from "./EventIncidentPanel";
import { EventInventoryPanel } from "./EventInventoryPanel";
import { EventTabIntro } from "./EventTabIntro";
import {
  type EventLifecycleActionKey,
  eventLifecyclePolicy,
} from "./EventLifecyclePolicy";
import { EventMarginTab } from "./EventMarginTab";
import { EventMenuTab } from "./EventMenuTab";
import { CompleteDraftPlanningPanel } from "./CompleteDraftPlanningPanel";
import { EventPrepTab } from "./EventPrepTab";
import { EventPhotosTab } from "./EventPhotosTab";
import { EventStaffingTab } from "./EventStaffingTab";
import { EventTabErrorBoundary } from "./EventTabErrorBoundary";
import { EventSourceProvenancePanel } from "./EventSourceProvenancePanel";
import { EventLayoutsTab } from "./EventLayoutsTab";
import { EventTimelineTab } from "./EventTimelineTab";
import { EventTimelineStaffRoster } from "./eventTimelineStaffRoster";
import { FailureBanner } from "./FailureBanner";
import { RecurringEventPanel } from "./RecurringEventPanel";
import {
  eventDetailPath,
  type EventDetailTab,
  parseEventDetailTab,
} from "./eventRoutes";
import { rememberLastViewedEvent } from "./lastViewedEvent";
import type { Doc } from "../../lib/api";

export function EventDetailPage() {
  const { id } = useParams();
  const event = useRouteRecord(useGetEvent, id);
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

  return <EventDetailContent event={event} id={id} />;
}

function EventDetailContent({
  event,
  id,
}: {
  event: Doc<"events">;
  id: string | undefined;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseEventDetailTab(searchParams.get("tab"));
  const mobile = useMobileViewport();
  const clients = useHeldQueryRows("clients", useListClient());
  const organizations = useListOrganization();
  // Same functional-currency rule as the phone Money card and Finance.
  const currencyCode = normalizeCurrencyCode(
    organizations?.find((row) => row.deletedAt == null)?.defaultCurrencyCode,
    "USD",
  );
  useTrackRecent("Event", event?.title);
  useEffect(() => {
    if (!id || event == null || event.deletedAt != null) return;
    rememberLastViewedEvent(eventDetailPath(id, activeTab));
  }, [activeTab, event, id]);
  const dishes = useHeldQueryRows("dishes", useListDish());
  const eventId = event?._id ?? "skip";
  const eventAssignments = useEventAssignmentRows(eventId);
  const staffNeeds = useEventStaffNeedRows(eventId);
  const shifts = useEventShiftRows(eventId);
  const eventDishes = useHeldQueryRows("eventDishes", useListEventDish());
  const timelineActivities = useHeldQueryRows(
    "eventTimelineActivities",
    useListEventTimelineActivity(),
  );
  const people = useHeldQueryRows("people", useListPerson());
  const venues = useHeldQueryRows("venues", useListVenue());
  const { branding } = useTenantBranding();
  const submitForApproval = useEventSubmitForApproval();
  const approve = useEventApprove();
  const lockForSales = useEventLockForSales();
  const confirmSalesLock = useEventConfirmSalesLock();
  const finalizeEvent = useEventFinalizeEvent();
  const beginExecution = useEventBeginExecution();
  const complete = useEventComplete();
  const closeOut = useEventCloseOut();
  const cancel = useEventCancel();
  const archive = useEventArchive();
  const returnToPlanning = useEventReturnToPlanning();
  const changeHeadcount = useEventChangeHeadcount();
  const changePricing = useEventChangePricing();
  const changePrimaryContact = useEventChangePrimaryContact();
  const changeRequirements = useEventChangeRequirements();
  const changeVenue = useEventChangeVenue();
  const reschedule = useEventReschedule();
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [reasonFor, setReasonFor] = useState<
    "cancel" | "returnToPlanning" | "archive" | null
  >(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const { notifySuccess, host: savedToast } = useSuccessToast();
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
  const venueLabel = eventVenueLabel({
    venueId: event.venueId,
    venueName: event.venueName,
    venue,
    venuesLoading: venues === undefined,
  });

  const setTab = (tab: EventDetailTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    next.delete("full");
    setSearchParams(next, { replace: true });
  };

  const run = async (work: () => Promise<unknown>, okMessage = "Saved") => {
    setFailure(null);
    setBusy(true);
    try {
      await work();
      setReasonFor(null);
      setReason("");
      notifySuccess(okMessage);
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
    const done = "Stage updated";
    if (key === "submitForApproval")
      void run(() => submitForApproval(args), done);
    if (key === "approve") void run(() => approve(args), done);
    if (key === "lockForSales") void run(() => lockForSales(args), done);
    if (key === "confirmSalesLock")
      void run(() => confirmSalesLock(args), done);
    if (key === "finalizeEvent") void run(() => finalizeEvent(args), done);
    if (key === "beginExecution") void run(() => beginExecution(args), done);
    if (key === "complete") void run(() => complete(args), done);
    if (key === "closeOut") void run(() => closeOut(args), done);
  };

  // One obvious next step: the first primary lifecycle action. Other stage
  // moves and every utility live under "More"; destructive moves sit last.
  const lifecycle = eventLifecyclePolicy.availableActions(
    String(event.stage),
    event,
  );
  const primaryAction = lifecycle.find((action) => action.kind === "primary");
  const secondaryActions = lifecycle.filter(
    (action) => action !== primaryAction && action.kind !== "danger",
  );
  const dangerActions = lifecycle.filter((action) => action.kind === "danger");
  const staffingRoster = EventTimelineStaffRoster.staffingRosterEntries({
    eventId: event._id,
    assignments: eventAssignments,
    staffNeeds,
    shifts,
    people,
  });
  const beoReady =
    !busy &&
    clients !== undefined &&
    dishes !== undefined &&
    eventAssignments !== undefined &&
    staffNeeds !== undefined &&
    shifts !== undefined &&
    eventDishes !== undefined &&
    people !== undefined &&
    timelineActivities !== undefined;

  // On desktop the prominent stage moves live in the overview's Stage actions
  // card and the menu keeps every one of them reachable from every tab. Phones
  // have no such card, so the next step stays a button in the header.
  const headerPrimary = mobile ? primaryAction : undefined;
  const menuStageActions = [
    ...(primaryAction && primaryAction !== headerPrimary
      ? [primaryAction]
      : []),
    ...secondaryActions,
  ];

  const exportBeo = () => {
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
      staff: staffingRoster,
      branding,
    })
      .then(() => {
        setPdfNotice("BEO PDF downloaded.");
        reportActionOk("BEO PDF downloaded.");
      })
      .catch((error) => setFailure(classifyCommandFailure(error)));
  };

  const dishCount = (eventDishes ?? []).filter(
    (selection) =>
      selection.eventId === event._id &&
      selection.deletedAt == null &&
      selection.removedAt == null,
  ).length;
  const staffCount = new Set(staffingRoster.map((entry) => entry.personId))
    .size;
  const timelineCount = (timelineActivities ?? []).filter(
    (activity) => activity.eventId === event._id && activity.deletedAt == null,
  ).length;

  const headerActions = [
    ...(headerPrimary
      ? [
          <button
            key={headerPrimary.key}
            type="button"
            disabled={busy}
            onClick={() => runAction(headerPrimary.key)}
            className="btn btn-primary"
          >
            {headerPrimary.label}
          </button>,
        ]
      : []),
    <button
      key="export-beo"
      type="button"
      className="btn btn-ghost"
      disabled={!beoReady}
      onClick={exportBeo}
    >
      <DownloadIcon width={14} height={14} />
      Export BEO
    </button>,
    <ActionMenu key="more">
      {mobile ? (
        <Link
          key="edit-details"
          to={`${eventDetailPath(event._id, "overview")}#event-setup-basics`}
        >
          Edit event details
        </Link>
      ) : null}
      <EventClientPortalShare key="client-portal-share" eventId={event._id} />
      {menuStageActions.map((action) => (
        <button
          key={action.key}
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => runAction(action.key)}
        >
          {action.label}
        </button>
      ))}
      <Link
        key="create-proposal"
        className="btn btn-ghost"
        to={`/clients/proposals?event=${event._id}`}
      >
        Create proposal
      </Link>
      <Link
        key="save-as-template"
        className="btn btn-ghost"
        to={`/events/templates?fromEvent=${event._id}`}
      >
        Save as template
      </Link>
      <Link
        key="allergen-briefing"
        className="btn btn-ghost"
        to={`/events/${event._id}/allergen-briefing`}
      >
        Allergen briefing
      </Link>
      {dangerActions.length > 0 ? <ActionMenuRule /> : null}
      {dangerActions.map((action) => (
        <button
          key={action.key}
          type="button"
          disabled={busy}
          onClick={() => runAction(action.key)}
          className="action-menu-danger"
        >
          {action.label}
        </button>
      ))}
      <EventDuplicateMenuItem event={event} busy={busy} run={run} />
      <EventArchiveMenuItems
        event={event}
        busy={busy}
        version={version}
        run={run}
        onArchive={() => {
          setReasonFor("archive");
          setReason("");
        }}
      />
    </ActionMenu>,
  ];

  const overviewProps = {
    eventId: event._id,
    event: event,
    version: version,
    busy: busy,
    canRevise: canRevise,
    canChangeHeadcount: canChangeHeadcount,
    reviseBlockedReason: reviseBlockedReason,
    headcountBlockedReason: headcountBlockedReason,
    venuesLoading: venues === undefined,
    activeVenues: activeVenues,
    venue: venue,
    clients: clients,
    clientId: event.clientId,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    expectedHeadcount: event.expectedHeadcount,
    venueId: event.venueId,
    budgetAmount: event.budgetAmount,
    quotedPrice: event.quotedPrice,
    primaryContactName: event.primaryContactName,
    primaryContactEmail: event.primaryContactEmail,
    primaryContactPhone: event.primaryContactPhone,
    accessibilityNeeds: event.accessibilityNeeds,
    serviceRequirements: event.serviceRequirements,
    operationalRequirements: event.operationalRequirements,
    stage: String(event.stage),
    currencyCode: currencyCode,
    lifecycleActions: lifecycle,
    onAction: runAction,
    people: people,
    dishCount: dishCount,
    staffCount: staffCount,
    timelineCount: timelineCount,
    run: run,
    onReschedule: reschedule,
    onChangeHeadcount: changeHeadcount,
    onChangeVenue: changeVenue,
    onChangePricing: changePricing,
    onChangePrimaryContact: changePrimaryContact,
    onChangeRequirements: changeRequirements,
  };
  const notices = (
    <>
      {savedToast}
      {pdfNotice ? (
        <p className="banner banner-ok" role="status">
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
            else if (reasonFor === "archive")
              void run(
                () =>
                  archive({
                    docId: event._id,
                    reason: reason.trim(),
                    version,
                  }),
                "Event archived",
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
              : reasonFor === "archive"
                ? "Reason for archiving"
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
              reasonFor === "cancel" || reasonFor === "archive"
                ? "btn btn-danger"
                : "btn btn-primary"
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

      {event.stage === "planning" && event.plannedAt == null ? (
        <CompleteDraftPlanningPanel event={event} clients={clients} />
      ) : null}
    </>
  );
  const otherTabs = (
    <>
      {activeTab === "chat" ? (
        <EventTabErrorBoundary tabLabel="Team Chat" key="chat">
          <EventChatTab eventId={event._id} eventTitle={String(event.title)} />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "menu" ? (
        <EventTabErrorBoundary tabLabel="Menu" key="menu">
          <EventMenuTab
            eventId={event._id}
            expectedHeadcount={event.expectedHeadcount}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "prep" ? (
        <EventTabErrorBoundary tabLabel="Prep" key="prep">
          <EventPrepTab eventId={event._id} eventStage={String(event.stage)} />
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
            accessibilityNeeds={event.accessibilityNeeds?.join(", ")}
            serviceRequirements={event.serviceRequirements}
            operationalRequirements={event.operationalRequirements}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "guests" ? (
        <EventTabErrorBoundary tabLabel="Guests" key="guests">
          <section className="space-y-4" data-testid="event-guests-tab">
            <EventTabIntro
              title="Guests"
              description="Invite guests, track RSVPs and table assignments, and note dietary needs so they show up on the allergen briefing."
            />
            <EventGuestPanel
              eventId={event._id}
              expectedHeadcount={event.expectedHeadcount}
            />
          </section>
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
            recurrenceActive={event.recurrenceActive ?? undefined}
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
      {activeTab === "inventory" ? (
        <EventTabErrorBoundary tabLabel="Inventory" key="inventory">
          <section className="space-y-4" data-testid="event-inventory-tab">
            <EventTabIntro
              title="Inventory"
              description="Reserve ingredient stock against this event's demand, then issue the holds as product leaves storage."
            />
            <EventInventoryPanel
              eventId={event._id}
              eventStage={String(event.stage)}
              busy={busy}
              onBusy={setBusy}
              onError={(error) =>
                setFailure(error == null ? null : classifyCommandFailure(error))
              }
            />
          </section>
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "incidents" ? (
        <EventTabErrorBoundary tabLabel="Incidents" key="incidents">
          <section className="space-y-4" data-testid="event-incidents-tab">
            <EventTabIntro
              title="Incidents"
              description="Report and resolve safety, allergen, and service incidents for this event. Allergen incidents open a required corrective action."
            />
            <EventIncidentPanel eventId={event._id} />
          </section>
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "margin" ? (
        <EventTabErrorBoundary tabLabel="Margin" key="margin">
          <EventMarginTab eventId={event._id} />
        </EventTabErrorBoundary>
      ) : null}
    </>
  );

  return (
    <EventDashboard
      title={String(event.title)}
      updatedAt={typeof event.updatedAt === "number" ? event.updatedAt : null}
      client={(() => {
        const client = clients?.find((c) => c._id === event.clientId);
        const name = clientDisplayName(event.clientId, clients);
        if (!client) return name;
        return (
          <HoverPreview card={<ClientPreviewCard client={client} />}>
            <Link to={`/clients/${client._id}`} className="hover:underline">
              {name}
            </Link>
          </HoverPreview>
        );
      })()}
      venue={
        event.venueId ? <Link to="/facilities">{venueLabel}</Link> : venueLabel
      }
      actions={headerActions}
      activeTab={activeTab}
      onTab={setTab}
      overview={overviewProps}
      notices={notices}
    >
      {otherTabs}
    </EventDashboard>
  );
}
