import {
  useMemo,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type FocusEvent,
} from "react";
import { Link } from "react-router-dom";
import { formatTime } from "../../lib/format";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import {
  useEventApprove,
  useEventAssignOwner,
  useEventChangeHeadcount,
  useEventChangeVenue,
  useEventConfirmSalesLock,
  useEventLockForSales,
  useEventReschedule,
  useEventSubmitForApproval,
  useListClient,
  useListDelivery,
  useListEvent,
  useListInvoice,
  useListPerson,
  useListServiceStyle,
  useListVehicle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { useSuccessToast } from "../../ui/useSuccessToast";
import {
  addDays,
  buildCalendarFacts,
  DAY_MS,
  LOCK_LABEL,
  startOfDay,
  type CalendarEventFacts,
} from "../home/homeCalendar";
import "../home/HomeCalendar.css";
import "./EventTracker.css";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { eventDetailPath, eventsIndexPath } from "./eventRoutes";
import { FailureBanner } from "./FailureBanner";

const LANE_DAYS = 14;
// Mirrors the Event command guards in src/operations/event.manifest so a card
// never offers an edit the command would refuse: reschedule / changeVenue /
// assignOwner stop at approved; changeHeadcount also runs while executing.
const RESCHEDULE_STAGES = new Set(["planning", "pending_approval", "approved"]);
const HEADCOUNT_STAGES = new Set([...RESCHEDULE_STAGES, "executing"]);
const DEFAULT_START_OFFSET = 10 * 60 * 60 * 1000;
const DEFAULT_DURATION = 4 * 60 * 60 * 1000;

type Lane = {
  key: string;
  label: string;
  sublabel: string;
  dayStart: number | null;
  events: CalendarEventFacts[];
};

function laneLabel(dayStart: number, today: number): string {
  if (dayStart === today) return "Today";
  if (dayStart === today + DAY_MS) return "Tomorrow";
  return new Date(dayStart).toLocaleDateString(undefined, { weekday: "long" });
}

function laneDate(dayStart: number): string {
  return new Date(dayStart).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function timeInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function durationOf(event: CalendarEventFacts): number {
  return event.startsAt != null &&
    event.endsAt != null &&
    event.endsAt > event.startsAt
    ? event.endsAt - event.startsAt
    : DEFAULT_DURATION;
}

/** Wall-clock start on `dayStart` at `hours:minutes`, DST-safe. */
function scheduleAt(
  event: CalendarEventFacts,
  dayStart: number,
  hours: number,
  minutes: number,
) {
  const start = new Date(dayStart);
  start.setHours(hours, minutes, 0, 0);
  const startsAt = start.getTime();
  return { startsAt, endsAt: startsAt + durationOf(event) };
}

/** New start/end on `dayStart`, keeping the wall-clock time and the duration. */
function movedSchedule(event: CalendarEventFacts, dayStart: number) {
  const current =
    event.startsAt != null
      ? new Date(event.startsAt)
      : new Date(dayStart + DEFAULT_START_OFFSET);
  return scheduleAt(event, dayStart, current.getHours(), current.getMinutes());
}

/** Same day, new clock time, same duration. */
function retimedSchedule(event: CalendarEventFacts, hhmm: string) {
  const [hours, minutes] = hhmm.split(":").map(Number);
  const day = startOfDay(event.startsAt ?? Date.now());
  return scheduleAt(event, day, hours, minutes);
}

function dateInput(ms: number | null): string {
  if (ms == null) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type StageMove = {
  label: string;
  run: (args: {
    docId: string;
    version: number | undefined;
  }) => Promise<unknown>;
};

/**
 * Event tracker: the next two weeks as day lanes. Drag a card to another day
 * to move it; change time, guests, venue, owner, and the sales lock right on
 * the card. Every write is the same command the event page uses, so the
 * guards are the same too — a locked event simply is not draggable.
 */
export function EventTrackerPage() {
  const authStatus = useAuthStatus();
  const events = useListEvent();
  const clients = useListClient();
  const venues = useListVenue();
  const deliveries = useListDelivery();
  const vehicles = useListVehicle();
  const serviceStyles = useListServiceStyle();
  const people = useListPerson();
  const invoices = useListInvoice();

  const reschedule = useEventReschedule();
  const changeHeadcount = useEventChangeHeadcount();
  const changeVenue = useEventChangeVenue();
  const assignOwner = useEventAssignOwner();
  const submitForApproval = useEventSubmitForApproval();
  const approve = useEventApprove();
  const lockForSales = useEventLockForSales();
  const confirmSalesLock = useEventConfirmSalesLock();

  const [search, setSearch] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overLane, setOverLane] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  // Bumped when an inline edit is rejected so the inputs fall back to the saved value.
  const [resetKey, setResetKey] = useState(0);
  const { notifySuccess, host: savedToast } = useSuccessToast();

  const loading = [
    authStatus,
    events,
    clients,
    venues,
    deliveries,
    vehicles,
    serviceStyles,
    people,
    invoices,
  ].some((value) => value === undefined);
  const { loadingTooLong } = useSlowQuery(loading ? undefined : true);

  const today = startOfDay(Date.now());
  const facts = useMemo(
    () =>
      loading
        ? []
        : buildCalendarFacts({
            events: events ?? [],
            clients: clients ?? [],
            venues: venues ?? [],
            deliveries: deliveries ?? [],
            vehicles: vehicles ?? [],
            serviceStyles: serviceStyles ?? [],
            people: people ?? [],
            invoices: invoices ?? [],
          }),
    [
      loading,
      events,
      clients,
      venues,
      deliveries,
      vehicles,
      serviceStyles,
      people,
      invoices,
    ],
  );

  const lanes = useMemo((): Lane[] => {
    const needle = search.trim().toLowerCase();
    const upcoming = facts.filter(
      (event) =>
        event.lock !== "done" &&
        event.lock !== "cancelled" &&
        // Still on the board: undated, starts today or later, still running,
        // or an overnight job without an end time that started yesterday.
        (event.startsAt == null ||
          event.startsAt >= today ||
          (event.endsAt != null && event.endsAt > today) ||
          (event.endsAt == null && event.startsAt >= today - DAY_MS)) &&
        (needle === "" ||
          [event.title, event.client, event.venue, event.eventNumber]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
    const horizon = addDays(today, LANE_DAYS);
    const days: Lane[] = [];
    for (let i = 0; i < LANE_DAYS; i += 1) {
      const dayStart = addDays(today, i);
      days.push({
        key: String(dayStart),
        label: laneLabel(dayStart, today),
        sublabel: laneDate(dayStart),
        dayStart,
        // A job that started before today but is still running sits on Today.
        events: upcoming.filter(
          (event) =>
            event.startsAt != null &&
            Math.max(startOfDay(event.startsAt), today) === dayStart,
        ),
      });
    }
    const later = upcoming.filter(
      (event) => event.startsAt != null && event.startsAt >= horizon,
    );
    const undated = upcoming.filter((event) => event.startsAt == null);
    return [
      ...days,
      {
        key: "later",
        label: "Later",
        sublabel: `after ${laneDate(horizon - DAY_MS)}`,
        dayStart: null,
        events: later,
      },
      {
        key: "undated",
        label: "No date",
        sublabel: "drag onto a day",
        dayStart: null,
        events: undated,
      },
    ];
  }, [facts, search, today]);

  if (loading) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading the tracker"
      />
    );
  }

  // Same truth as the Event execute policy (eventAccess or salesAccess): a
  // role that cannot run the commands gets a read-only board, not a denial
  // banner on every edit.
  const permissions = new Set(resolveManifestPolicies(authStatus?.role ?? ""));
  const canExecute =
    permissions.has("eventAccess") || permissions.has("salesAccess");

  const activeVenues = (venues ?? []).filter(
    (venue) =>
      venue.status === "active" &&
      venue.registeredAt != null &&
      venue.deletedAt == null,
  );
  const roster = (people ?? []).filter(
    (person) => person.deletedAt == null && person.status === "active",
  );

  const run = async (
    event: CalendarEventFacts,
    work: () => Promise<unknown>,
    okMessage: string,
  ) => {
    setFailure(null);
    setBusyId(event.id);
    try {
      await work();
      notifySuccess(okMessage);
    } catch (error) {
      setFailure(classifyCommandFailure(error));
      setResetKey((key) => key + 1);
    } finally {
      setBusyId(null);
    }
  };

  const canReschedule = (event: CalendarEventFacts) =>
    canExecute && RESCHEDULE_STAGES.has(event.stage);
  const canChangeGuests = (event: CalendarEventFacts) =>
    canExecute && HEADCOUNT_STAGES.has(event.stage);

  // Each button mirrors its command's own guards, so a role never sees a
  // next step the server would refuse.
  const canApprove = permissions.has("eventManageAccess");
  const canLock = permissions.has("salesAccess");
  const stageMove = (event: CalendarEventFacts): StageMove | null => {
    if (!canExecute) return null;
    switch (event.stage) {
      case "planning":
        return event.planned
          ? { label: "Submit for approval", run: submitForApproval }
          : null;
      case "pending_approval":
        return canApprove ? { label: "Approve", run: approve } : null;
      case "approved":
        return canLock ? { label: "Lock sales", run: lockForSales } : null;
      case "sales_lock":
        return canLock
          ? { label: "Confirm lock & start execution", run: confirmSalesLock }
          : null;
      default:
        return null;
    }
  };

  const dropOn = (lane: Lane, domEvent: DragEvent<HTMLElement>) => {
    domEvent.preventDefault();
    setOverLane(null);
    const id = domEvent.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!id || lane.dayStart == null) return;
    const event = facts.find((entry) => entry.id === id);
    if (!event || !canReschedule(event)) return;
    // Same display-day rule as lane placement: a job that started before
    // today sits on Today, and a drop back onto Today is a no-op.
    if (
      event.startsAt != null &&
      Math.max(startOfDay(event.startsAt), today) === lane.dayStart
    )
      return;
    const next = movedSchedule(event, lane.dayStart);
    void run(
      event,
      () =>
        reschedule({
          docId: event.id,
          version: event.version,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
        }),
      `Moved to ${lane.label === "Today" || lane.label === "Tomorrow" ? lane.label.toLowerCase() : lane.sublabel}`,
    );
  };

  const commitGuests = (event: CalendarEventFacts, raw: string) => {
    const value = Number(raw);
    if (value === event.guests) return;
    if (!Number.isFinite(value) || value < 1) {
      setResetKey((key) => key + 1);
      return;
    }
    void run(
      event,
      () =>
        changeHeadcount({
          docId: event.id,
          version: event.version,
          newHeadcount: Math.round(value),
        }),
      "Guest count saved",
    );
  };

  const commitDate = (event: CalendarEventFacts, value: string) => {
    if (!value || value === dateInput(event.startsAt)) return;
    const day = new Date(`${value}T00:00:00`).getTime();
    if (Number.isNaN(day)) {
      setResetKey((key) => key + 1);
      return;
    }
    const next = movedSchedule(event, startOfDay(day));
    void run(
      event,
      () =>
        reschedule({
          docId: event.id,
          version: event.version,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
        }),
      "Date saved",
    );
  };

  const commitTime = (event: CalendarEventFacts, hhmm: string) => {
    if (hhmm === timeInput(event.startsAt)) return;
    if (!hhmm) {
      setResetKey((key) => key + 1);
      return;
    }
    const next = retimedSchedule(event, hhmm);
    void run(
      event,
      () =>
        reschedule({
          docId: event.id,
          version: event.version,
          startsAt: next.startsAt,
          endsAt: next.endsAt,
        }),
      "Time saved",
    );
  };

  const commitVenue = (event: CalendarEventFacts, venueId: string) => {
    if ((event.venueId ?? "") === venueId) return;
    const selected = activeVenues.find((venue) => venue._id === venueId);
    void run(
      event,
      () =>
        changeVenue({
          docId: event.id,
          version: event.version,
          venueId: selected?._id,
          venueName: selected?.name,
          venueAddress: selected
            ? [
                selected.addressLine1,
                selected.city,
                selected.region,
                selected.postalCode,
              ]
                .filter(Boolean)
                .join(", ") || undefined
            : undefined,
          venueCapacity: selected?.capacity,
        }),
      "Venue saved",
    );
  };

  const commitOwner = (event: CalendarEventFacts, personId: string) => {
    if ((event.ownerId ?? "") === personId) return;
    void run(
      event,
      () =>
        assignOwner({
          docId: event.id,
          version: event.version,
          assignedToId: personId || undefined,
        }),
      "Owner saved",
    );
  };

  const total = lanes.reduce((sum, lane) => sum + lane.events.length, 0);
  const dragged = draggingId
    ? facts.find((entry) => entry.id === draggingId)
    : undefined;

  return (
    <div className="event-tracker">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Events · Tracker</p>
          <h1 className="font-display mt-1 text-4xl leading-none tracking-tight text-ink">
            Next two weeks
          </h1>
          <p className="mt-2 text-base text-ink-2">
            {canExecute
              ? "Drag a card to another day to move it, or set the date on the card. Edit time, guests, venue, owner, and the sales lock right there."
              : "Your role can view the board. Changing an event needs event or sales access."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            className="input tracker-search"
            placeholder="Find title, client, venue, #"
            value={search}
            onChange={(domEvent) => setSearch(domEvent.target.value)}
            aria-label="Find events"
          />
          <Link to="/" className="btn btn-ghost">
            Calendar
          </Link>
          <Link to={eventsIndexPath()} className="btn btn-ghost">
            All events
          </Link>
        </div>
      </div>

      <div className="fact-row mt-3">
        <span className="fact">
          <b>Upcoming:</b>
          {total} events
        </span>
        {(["open", "approved", "locked", "live"] as const).map((lock) => (
          <span key={lock} className="fact tracker-legend" data-lock={lock}>
            <i />
            {LOCK_LABEL[lock]}
          </span>
        ))}
      </div>

      {failure ? (
        <div className="mt-4">
          <FailureBanner failure={failure} onDismiss={() => setFailure(null)} />
        </div>
      ) : null}

      <div className="tracker-board" role="list">
        {lanes.map((lane) => {
          const droppable =
            lane.dayStart != null && !!dragged && canReschedule(dragged);
          return (
            <section
              key={lane.key}
              role="listitem"
              className="tracker-lane"
              data-today={lane.dayStart === today || undefined}
              data-droppable={droppable || undefined}
              data-over={overLane === lane.key || undefined}
              data-empty={lane.events.length === 0 || undefined}
              onDragOver={(domEvent) => {
                if (!droppable) return;
                domEvent.preventDefault();
                domEvent.dataTransfer.dropEffect = "move";
                if (overLane !== lane.key) setOverLane(lane.key);
              }}
              onDragLeave={(domEvent) => {
                if (
                  domEvent.currentTarget.contains(
                    domEvent.relatedTarget as Node | null,
                  )
                )
                  return;
                if (overLane === lane.key) setOverLane(null);
              }}
              onDrop={(domEvent) => dropOn(lane, domEvent)}
            >
              <header className="tracker-lane-head">
                <strong>{lane.label}</strong>
                <span>{lane.sublabel}</span>
                <b>{lane.events.length}</b>
              </header>
              <div className="tracker-lane-body">
                {lane.events.length === 0 ? (
                  <p className="tracker-lane-empty">
                    {droppable ? "Drop here" : "Nothing booked"}
                  </p>
                ) : null}
                {lane.events.map((event) => {
                  const move = stageMove(event);
                  const draggable = canReschedule(event) && busyId !== event.id;
                  const busy = busyId === event.id;
                  return (
                    <article
                      key={event.id}
                      className="tracker-card"
                      data-lock={event.lock}
                      data-busy={busy || undefined}
                      data-dragging={draggingId === event.id || undefined}
                      draggable={draggable}
                      title={
                        draggable
                          ? "Drag to another day to move this event"
                          : canExecute
                            ? `Date is fixed while the event is ${event.stageLabel.toLowerCase()}`
                            : "View only for your role"
                      }
                      onDragStart={(domEvent) => {
                        const fromField =
                          domEvent.target instanceof Element &&
                          domEvent.target.closest("input, select, button, a");
                        if (!draggable || fromField) {
                          domEvent.preventDefault();
                          return;
                        }
                        domEvent.dataTransfer.setData("text/plain", event.id);
                        domEvent.dataTransfer.effectAllowed = "move";
                        setDraggingId(event.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverLane(null);
                      }}
                    >
                      <div className="tracker-card-head">
                        <span className="tracker-card-grip" aria-hidden="true">
                          {draggable ? "⋮⋮" : "🔒"}
                        </span>
                        <Link
                          to={eventDetailPath(event.id)}
                          className="tracker-card-title"
                        >
                          {event.title}
                        </Link>
                        <span
                          className="home-cal-lock-pill"
                          data-lock={event.lock}
                        >
                          {event.lockLabel}
                        </span>
                      </div>
                      <p className="tracker-card-meta">
                        <span>{event.eventNumber}</span>
                        <span>{event.client}</span>
                        <span>{event.serviceType}</span>
                      </p>

                      <div className="tracker-card-fields">
                        <label>
                          <span>Date</span>
                          <input
                            key={`${event.startsAt ?? "none"}:${resetKey}`}
                            type="date"
                            className="input"
                            defaultValue={dateInput(event.startsAt)}
                            disabled={!canReschedule(event) || busy}
                            onBlur={(domEvent: FocusEvent<HTMLInputElement>) =>
                              commitDate(event, domEvent.currentTarget.value)
                            }
                            onKeyDown={(
                              domEvent: KeyboardEvent<HTMLInputElement>,
                            ) => {
                              if (domEvent.key === "Enter")
                                domEvent.currentTarget.blur();
                            }}
                          />
                        </label>
                        <label>
                          <span>Time</span>
                          <input
                            key={`${event.startsAt ?? "none"}:${resetKey}`}
                            type="time"
                            className="input"
                            defaultValue={timeInput(event.startsAt)}
                            disabled={
                              !canReschedule(event) ||
                              busy ||
                              event.startsAt == null
                            }
                            title={
                              event.startsAt == null
                                ? "Set a date first"
                                : undefined
                            }
                            onBlur={(domEvent: FocusEvent<HTMLInputElement>) =>
                              commitTime(event, domEvent.currentTarget.value)
                            }
                            onKeyDown={(
                              domEvent: KeyboardEvent<HTMLInputElement>,
                            ) => {
                              if (domEvent.key === "Enter")
                                domEvent.currentTarget.blur();
                            }}
                          />
                        </label>
                        <label>
                          <span>Guests</span>
                          <input
                            key={`${event.guests}:${resetKey}`}
                            type="number"
                            min={1}
                            step={1}
                            className="input"
                            defaultValue={event.guests || ""}
                            disabled={!canChangeGuests(event) || busy}
                            onBlur={(domEvent: FocusEvent<HTMLInputElement>) =>
                              commitGuests(event, domEvent.currentTarget.value)
                            }
                            onKeyDown={(
                              domEvent: KeyboardEvent<HTMLInputElement>,
                            ) => {
                              if (domEvent.key === "Enter")
                                domEvent.currentTarget.blur();
                            }}
                          />
                        </label>
                        <label className="tracker-field-wide">
                          <span>Venue</span>
                          <select
                            className="input"
                            value={event.venueId ?? ""}
                            disabled={!canReschedule(event) || busy}
                            onChange={(domEvent) =>
                              commitVenue(event, domEvent.currentTarget.value)
                            }
                          >
                            <option value="">
                              {event.venueId ? "No venue" : event.venue}
                            </option>
                            {event.venueId &&
                            !activeVenues.some(
                              (venue) => venue._id === event.venueId,
                            ) ? (
                              <option value={event.venueId} disabled>
                                {event.venue} (inactive)
                              </option>
                            ) : null}
                            {activeVenues.map((venue) => (
                              <option key={venue._id} value={venue._id}>
                                {venue.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="tracker-field-wide">
                          <span>Owner</span>
                          <select
                            className="input"
                            value={event.ownerId ?? ""}
                            disabled={!canReschedule(event) || busy}
                            onChange={(domEvent) =>
                              commitOwner(event, domEvent.currentTarget.value)
                            }
                          >
                            <option value="">Unassigned</option>
                            {event.ownerId &&
                            !roster.some(
                              (person) => person._id === event.ownerId,
                            ) ? (
                              <option value={event.ownerId} disabled>
                                {event.owner} (inactive)
                              </option>
                            ) : null}
                            {roster.map((person) => (
                              <option key={person._id} value={person._id}>
                                {`${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() ||
                                  "Unnamed"}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="tracker-card-foot">
                        <span className="tracker-card-fact">
                          <b>Vehicle:</b>
                          {event.vehicle}
                        </span>
                        {event.startsAt != null && event.endsAt != null ? (
                          <span className="tracker-card-fact">
                            <b>Ends:</b>
                            {formatTime(event.endsAt)}
                          </span>
                        ) : null}
                        {move ? (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm ml-auto"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                event,
                                () =>
                                  move.run({
                                    docId: event.id,
                                    version: event.version,
                                  }),
                                "Stage updated",
                              )
                            }
                          >
                            {move.label}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {savedToast}
    </div>
  );
}
