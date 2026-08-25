import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMobileViewport } from "../../app/shell/useMobileViewport";
import {
  formatCount,
  formatDate,
  formatMoney,
  formatTime,
  relativeDays,
} from "../../lib/format";
import { useRouteRecord } from "../../lib/routeRecord";
import { formatStatusLabel } from "../../lib/statusLabels";
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
  useEventConfirmSalesLock,
  useEventFinalizeEvent,
  useEventLockForSales,
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
import {
  ActionMenu,
  ActionMenuRule,
  ErrorState,
  StatusChip,
} from "../../ui/primitives";
import { useSuccessToast } from "../../ui/useSuccessToast";
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
import { EventOverviewTab } from "./EventOverviewTab";
import { EventPrepTab } from "./EventPrepTab";
import { EventPhotosTab } from "./EventPhotosTab";
import { EventStaffingTab } from "./EventStaffingTab";
import { EventTabErrorBoundary } from "./EventTabErrorBoundary";
import { EventWeatherPanel } from "./EventWeatherPanel";
import { EventSourceProvenancePanel } from "./EventSourceProvenancePanel";
import { EventLayoutsTab } from "./EventLayoutsTab";
import { EventTimelineTab } from "./EventTimelineTab";
import { FailureBanner } from "./FailureBanner";
import { MobileEventOverview } from "./mobile/MobileEventOverview";
import { RecurringEventPanel } from "./RecurringEventPanel";
import {
  eventDetailPath,
  type EventDetailTab,
  parseEventDetailTab,
} from "./eventRoutes";
import { rememberLastViewedEvent } from "./lastViewedEvent";

function HeroFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold tracking-[0.04em] text-ink-2 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-semibold break-words text-ink">
        {children}
      </dd>
    </div>
  );
}

export function EventDetailPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseEventDetailTab(searchParams.get("tab"));
  const event = useRouteRecord(useGetEvent, id);
  const mobile = useMobileViewport();
  // Phones get the nine-card overview; `full=1` opens the desktop overview
  // (edit panels, staff discussion) on a phone via "Edit" / "See all".
  const mobileOverview =
    mobile && activeTab === "overview" && searchParams.get("full") !== "1";
  const clients = useListClient();
  useTrackRecent("Event", event?.title);
  useEffect(() => {
    if (!id || event == null || event.deletedAt != null) return;
    rememberLastViewedEvent(eventDetailPath(id, activeTab));
  }, [activeTab, event, id]);
  const dishes = useListDish();
  const eventAssignments = useListEventAssignment();
  const eventDishes = useListEventDish();
  const timelineActivities = useListEventTimelineActivity();
  const people = useListPerson();
  const venues = useListVenue();
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
  const { notifySuccess, host: savedToast } = useSuccessToast();
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
  const lifecycle = eventLifecyclePolicy.availableActions(String(event.stage));
  const primaryAction = lifecycle.find((action) => action.kind === "primary");
  const secondaryActions = lifecycle.filter(
    (action) => action !== primaryAction && action.kind !== "danger",
  );
  const dangerActions = lifecycle.filter((action) => action.kind === "danger");
  const beoReady =
    !busy &&
    clients !== undefined &&
    dishes !== undefined &&
    eventAssignments !== undefined &&
    eventDishes !== undefined &&
    people !== undefined &&
    timelineActivities !== undefined;

  const headerActions = [
    ...(primaryAction
      ? [
          <button
            key={primaryAction.key}
            type="button"
            disabled={busy}
            onClick={() => runAction(primaryAction.key)}
            className="btn btn-primary"
          >
            {primaryAction.label}
          </button>,
        ]
      : []),
    ...secondaryActions.map((action) => (
      <button
        key={action.key}
        type="button"
        disabled={busy}
        onClick={() => runAction(action.key)}
        className={`btn ${action.kind === "primary" ? "btn-secondary" : "btn-ghost"}`}
      >
        {action.label}
      </button>
    )),
    <ActionMenu key="more">
      {mobile ? (
        <Link
          key="edit-details"
          to={`${eventDetailPath(event._id, "overview")}&full=1`}
        >
          Edit event details
        </Link>
      ) : null}
      <EventClientPortalShare key="client-portal-share" eventId={event._id} />
      <button
        key="download-beo"
        type="button"
        className="btn btn-ghost"
        disabled={!beoReady}
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
      </button>
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
    </ActionMenu>,
  ];

  return (
    <div className="space-y-5">
      {mobile ? (
        <section
          className="card px-4 py-4"
          data-testid="event-context-header-mobile"
        >
          <div className="flex items-start gap-2">
            <Link
              to="/events"
              aria-label="All events"
              className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-inset"
            >
              <ArrowLeftIcon width={18} height={18} />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl leading-tight font-bold text-ink">
                {event.title}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <StatusChip status={String(event.stage)} />
                <span>{formatStatusLabel(event.eventType)}</span>
                {event.startsAt != null ? (
                  <span>· {relativeDays(event.startsAt)}</span>
                ) : null}
              </div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
            <HeroFact label="Date">
              {formatDate(event.startsAt)}
              <span className="block text-sm font-medium text-ink-2">
                {event.startsAt != null
                  ? `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`
                  : "—"}
              </span>
            </HeroFact>
            <HeroFact label="Headcount">
              {formatCount(event.expectedHeadcount)} guests
            </HeroFact>
            <HeroFact label="Venue">
              {venue ? venue.name : "No venue yet"}
            </HeroFact>
            <HeroFact label="Client">
              {clientDisplayName(event.clientId, clients)}
            </HeroFact>
          </dl>
          <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">
            <span className="font-semibold text-ink">Budget / quoted</span>{" "}
            {formatMoney(event.budgetAmount)} / {formatMoney(event.quotedPrice)}
          </p>
          <div className="mobile-actions mt-4 flex items-center gap-2">
            {headerActions}
          </div>
        </section>
      ) : (
        <section className="card px-6 py-5" data-testid="event-context-header">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <Link
                to="/events"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-2 hover:text-ink"
              >
                <ArrowLeftIcon width={13} height={13} /> All events
              </Link>
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight text-ink">
                  {event.title}
                </h1>
                <StatusChip status={String(event.stage)} />
              </div>
              <p className="mt-1 text-base text-ink-2">
                {formatStatusLabel(event.eventType)}
                {event.startsAt != null
                  ? ` · ${relativeDays(event.startsAt)}`
                  : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {headerActions}
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 md:grid-cols-3 xl:grid-cols-6">
            <HeroFact label="Date">{formatDate(event.startsAt)}</HeroFact>
            <HeroFact label="Time">
              {event.startsAt != null
                ? `${formatTime(event.startsAt)} – ${formatTime(event.endsAt)}`
                : "—"}
            </HeroFact>
            <HeroFact label="Headcount">
              {formatCount(event.expectedHeadcount)} guests
            </HeroFact>
            <HeroFact label="Venue">
              {venue ? (
                <Link to="/facilities" className="hover:underline">
                  {venue.name}
                </Link>
              ) : (
                "No venue yet"
              )}
            </HeroFact>
            <HeroFact label="Client">
              {(() => {
                const client = clients?.find((c) => c._id === event.clientId);
                const name = clientDisplayName(event.clientId, clients);
                if (!client) return name;
                return (
                  <HoverPreview card={<ClientPreviewCard client={client} />}>
                    <Link
                      to={`/clients/${client._id}`}
                      className="hover:underline"
                    >
                      {name}
                    </Link>
                  </HoverPreview>
                );
              })()}
            </HeroFact>
            <HeroFact label="Budget / quoted">
              {formatMoney(event.budgetAmount)} /{" "}
              {formatMoney(event.quotedPrice)}
            </HeroFact>
          </dl>
        </section>
      )}

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

      <EventDetailTabs active={activeTab} onChange={setTab} compact={mobile} />

      {mobileOverview ? (
        <EventTabErrorBoundary tabLabel="Overview" key="mobile-overview">
          <MobileEventOverview
            event={event}
            venue={venue}
            clients={clients}
            dishes={dishes}
            eventDishes={eventDishes}
            activities={timelineActivities}
            assignments={eventAssignments}
            people={people}
          />
        </EventTabErrorBoundary>
      ) : null}
      {activeTab === "overview" && !mobileOverview ? (
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
          <div className="mt-4">
            <EventSourceProvenancePanel capsuleId={event._id} />
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
            accessibilityNeeds={event.accessibilityNeeds}
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
              description="Invite guests, track RSVPs and table assignments, and record dietary needs that feed the allergen briefing."
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
    </div>
  );
}
