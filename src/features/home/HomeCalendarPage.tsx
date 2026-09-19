import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
} from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Id } from "../../lib/api";
import { formatTime } from "../../lib/format";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  useListClient,
  useListDelivery,
  useListEvent,
  useListEventNumberAssignment,
  useListInvoice,
  useListPerson,
  useListServiceStyle,
  useListVehicle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { ChevronLeftIcon, ChevronRightIcon } from "../../ui/icons";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { reportActionFail, reportActionOk } from "../../ui/action-result";
import { eventDetailPath, eventsIndexPath } from "../events/eventRoutes";
import {
  useAssignVehicle,
  useUnassignVehicle,
} from "../facilities/vehicleAssignment";
import { useEventReportList } from "./EventReportRail";
import { openEventReports, useWorkingEventId } from "../events/workingEvent";
import type { TppReportDefinition } from "../reports/tpp/types";
import {
  buildCalendarFacts,
  buildMonthGrid,
  LOCK_LABEL,
  LOCK_ORDER,
  startOfDay,
  unscheduledEvents,
  type CalendarEventFacts,
} from "./homeCalendar";
import { canAssignDeliveryVehicle } from "./vehicleRoleAccess";
import "./HomeCalendar.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 4;
const TOOLTIP_WIDTH = 620;
const TOOLTIP_HEIGHT = 430;

type Hover = {
  event: CalendarEventFacts;
  top: number;
  left: number;
  width: number;
};

type CalendarVehicleOption = {
  id: string;
  label: string;
  retired: boolean;
};

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function dateSpan(event: CalendarEventFacts): string {
  if (event.startsAt == null) return "Unscheduled";
  const start = new Date(event.startsAt).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = formatTime(event.startsAt);
  const end = event.endsAt != null ? ` – ${formatTime(event.endsAt)}` : "";
  return `${start} · ${time}${end}`;
}

/** Fixed-position card so a chip at the bottom of the grid never clips. */
function EventTooltip({
  hover,
  reports,
  onReportAction,
  vehicles,
  vehicleBusyId,
  vehicleError,
  onVehicleChange,
  canAssignVehicle,
  onEnter,
  onLeave,
  onFocus,
  onBlur,
}: {
  hover: Hover;
  reports: readonly TppReportDefinition[];
  onReportAction: (
    event: CalendarEventFacts,
    definition: TppReportDefinition,
    print: boolean,
  ) => void;
  vehicles: readonly CalendarVehicleOption[];
  vehicleBusyId: string | null;
  vehicleError: string | null;
  canAssignVehicle: boolean;
  onVehicleChange: (
    deliveryId: string,
    vehicleId: string,
    version: number,
  ) => void;
  onEnter: () => void;
  onLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { event } = hover;
  const facts: [string, string][] = [
    ["Event #", event.eventNumber],
    ["When", dateSpan(event)],
    ["Guests", String(event.guests)],
    ["Client", event.client],
    ["Venue", event.venue],
    ["Service", event.serviceType],
    ["Vehicle", event.vehicle],
    ["Owner", event.owner],
    ["Stage", event.stageLabel],
  ];
  return (
    <div
      role="dialog"
      aria-label={`${event.title} details and reports`}
      className="home-cal-tooltip"
      data-lock={event.lock}
      style={{ top: hover.top, left: hover.left, width: hover.width }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <div className="home-cal-tooltip-head">
        <strong>{event.title}</strong>
        <span className="home-cal-lock-pill" data-lock={event.lock}>
          {event.lockLabel}
        </span>
      </div>
      <div className="home-cal-tooltip-body">
        <dl>
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {label === "Vehicle" && event.deliveryAssignments.length === 1
                  ? (() => {
                      const delivery = event.deliveryAssignments[0];
                      return (
                        <select
                          className="input home-cal-tooltip-select"
                          aria-label={`Vehicle for ${event.title}`}
                          value={delivery.vehicleId ?? ""}
                          disabled={
                            !canAssignVehicle ||
                            !delivery.canChangeVehicle ||
                            vehicleBusyId != null
                          }
                          onChange={(domEvent) =>
                            onVehicleChange(
                              delivery.id,
                              domEvent.currentTarget.value,
                              delivery.version,
                            )
                          }
                        >
                          <option value="">
                            {vehicleBusyId === delivery.id
                              ? "Saving…"
                              : "No vehicle"}
                          </option>
                          {vehicles.map((vehicle) => (
                            <option
                              key={vehicle.id}
                              value={vehicle.id}
                              disabled={vehicle.retired}
                            >
                              {vehicle.label}
                              {vehicle.retired ? " · Retired" : ""}
                            </option>
                          ))}
                        </select>
                      );
                    })()
                  : value}
              </dd>
            </div>
          ))}
        </dl>
        {event.deliveryAssignments.length > 1 ? (
          <section
            className="home-cal-tooltip-vehicles"
            aria-label="Delivery vehicle assignments"
          >
            <div className="home-cal-tooltip-section-head">
              <strong>Vehicles</strong>
              <span>{event.deliveryAssignments.length} runs</span>
            </div>
            <ul>
              {event.deliveryAssignments.map((delivery) => (
                <li key={delivery.id}>
                  <span title={delivery.destination}>
                    {delivery.destination}
                  </span>
                  <select
                    className="input home-cal-tooltip-select"
                    aria-label={`Vehicle for ${delivery.destination}`}
                    value={delivery.vehicleId ?? ""}
                    disabled={
                      !canAssignVehicle ||
                      !delivery.canChangeVehicle ||
                      vehicleBusyId != null
                    }
                    onChange={(domEvent) =>
                      onVehicleChange(
                        delivery.id,
                        domEvent.currentTarget.value,
                        delivery.version,
                      )
                    }
                  >
                    <option value="">
                      {vehicleBusyId === delivery.id ? "Saving…" : "No vehicle"}
                    </option>
                    {vehicles.map((vehicle) => (
                      <option
                        key={vehicle.id}
                        value={vehicle.id}
                        disabled={vehicle.retired}
                      >
                        {vehicle.label}
                        {vehicle.retired ? " · Retired" : ""}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {vehicleError ? (
          <p className="home-cal-tooltip-error" role="alert">
            {vehicleError}
          </p>
        ) : null}
        {!canAssignVehicle && event.deliveryAssignments.length > 0 ? (
          <p className="home-cal-tooltip-note">
            Logistics or a manager assigns vehicles.
          </p>
        ) : null}
        <section
          className="home-cal-tooltip-reports"
          aria-label="Event reports"
        >
          <div className="home-cal-tooltip-section-head">
            <strong>Reports</strong>
            <span>{reports.length} saved</span>
          </div>
          {reports.length > 0 ? (
            <ul>
              {reports.map((definition) => (
                <li key={definition.id}>
                  <span title={definition.name}>{definition.name}</span>
                  <div className="home-cal-tooltip-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => onReportAction(event, definition, false)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={() => onReportAction(event, definition, true)}
                    >
                      Print
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p>Choose reports from the Reports tab.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function tooltipPosition(target: HTMLElement): {
  top: number;
  left: number;
  width: number;
} {
  const rect = target.getBoundingClientRect();
  const width = Math.min(TOOLTIP_WIDTH, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const below = rect.bottom + 6;
  const above = rect.top - TOOLTIP_HEIGHT - 6;
  const top =
    window.innerHeight - below >= TOOLTIP_HEIGHT ? below : Math.max(8, above);
  return { top, left, width };
}

/**
 * Home: the month at a glance. Every event sits on its day, coloured by
 * whether sales can still change it. Hover for the facts, click to load the
 * report rail, double-click to open the event.
 */
export function HomeCalendarPage() {
  const navigate = useNavigate();
  const authStatus = useAuthStatus();
  const events = useListEvent();
  const clients = useListClient();
  const venues = useListVenue();
  const deliveries = useListDelivery();
  const vehicles = useListVehicle();
  const serviceStyles = useListServiceStyle();
  const people = useListPerson();
  const invoices = useListInvoice();
  const numberAssignments = useListEventNumberAssignment();
  const assignVehicle = useAssignVehicle();
  const unassignVehicle = useUnassignVehicle();

  const today = startOfDay(Date.now());
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  // The calendar's selection is the working event; the shell rail shows it.
  const selectedId = useWorkingEventId();
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [lockFilter, setLockFilter] = useState<Set<string>>(new Set());
  const [vehicleBusyId, setVehicleBusyId] = useState<string | null>(null);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const tooltipHideTimer = useRef<number | null>(null);
  const storageScope = authStatus?.personId ?? "anonymous";
  const { chosen: reports } = useEventReportList(storageScope);

  const vehicleOptions = useMemo<CalendarVehicleOption[]>(
    () =>
      (vehicles ?? [])
        .filter((vehicle) => vehicle.deletedAt == null)
        .map((vehicle) => ({
          id: vehicle._id,
          label: [vehicle.registration, vehicle.make, vehicle.model]
            .filter((part) => Boolean(part))
            .join(" · "),
          retired: String(vehicle.operationalStatus) === "retired",
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [vehicles],
  );

  useEffect(
    () => () => {
      if (tooltipHideTimer.current != null) {
        window.clearTimeout(tooltipHideTimer.current);
      }
    },
    [],
  );

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
            numberAssignments: numberAssignments ?? [],
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
      numberAssignments,
    ],
  );
  const shown = useMemo(
    () =>
      lockFilter.size === 0
        ? facts
        : facts.filter((event) => lockFilter.has(event.lock)),
    [facts, lockFilter],
  );
  const weeks = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, shown),
    [cursor.month, cursor.year, shown],
  );
  const unscheduled = useMemo(() => unscheduledEvents(shown), [shown]);
  const selected = facts.find((event) => event.id === selectedId) ?? null;
  const inMonth = new Set(
    weeks
      .flat()
      .filter((cell) => cell.inMonth)
      .flatMap((cell) => cell.events.map((event) => event.id)),
  ).size;

  if (loading) {
    return (
      <QueryLoadState
        loadingTooLong={loadingTooLong}
        title="Still loading the calendar"
      />
    );
  }

  const move = (delta: number) =>
    setCursor((current) => {
      const d = new Date(current.year, current.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const jumpToday = () => {
    const d = new Date(today);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };
  const toggleLock = (lock: string) =>
    setLockFilter((current) => {
      const next = new Set(current);
      if (next.has(lock)) next.delete(lock);
      else next.add(lock);
      return next;
    });

  const cancelTooltipHide = () => {
    if (tooltipHideTimer.current != null) {
      window.clearTimeout(tooltipHideTimer.current);
      tooltipHideTimer.current = null;
    }
  };
  const showTooltip = (
    event: CalendarEventFacts,
    domEvent: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
  ) => {
    cancelTooltipHide();
    setVehicleError(null);
    setHover({ event, ...tooltipPosition(domEvent.currentTarget) });
  };
  const hideTooltip = () => {
    cancelTooltipHide();
    tooltipHideTimer.current = window.setTimeout(() => {
      setHover(null);
      tooltipHideTimer.current = null;
    }, 180);
  };
  const launchReport = (
    event: CalendarEventFacts,
    definition: TppReportDefinition,
    print: boolean,
  ) => {
    openEventReports(event.id, definition.id, print);
    setHover(null);
  };
  const changeVehicle = (
    deliveryId: string,
    vehicleId: string,
    version: number,
  ) => {
    setVehicleError(null);
    setVehicleBusyId(deliveryId);
    void (async () => {
      try {
        if (vehicleId) {
          await assignVehicle({
            deliveryId: deliveryId as Id<"deliveries">,
            vehicleId: vehicleId as Id<"vehicles">,
            version,
          });
          reportActionOk("Vehicle assigned.");
        } else {
          await unassignVehicle({
            deliveryId: deliveryId as Id<"deliveries">,
            version,
          });
          reportActionOk("Vehicle cleared.");
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Vehicle could not be updated.";
        setVehicleError(message);
        reportActionFail(message);
      } finally {
        setVehicleBusyId(null);
      }
    })();
  };

  const chip = (event: CalendarEventFacts, dayStart: number) => {
    const continues =
      event.startsAt != null && startOfDay(event.startsAt) !== dayStart;
    return (
      <button
        key={`${event.id}:${dayStart}`}
        type="button"
        className="home-cal-chip"
        data-lock={event.lock}
        data-selected={selectedId === event.id || undefined}
        data-continues={continues || undefined}
        onClick={() => {
          openEventReports(event.id);
          setHover(null);
        }}
        onDoubleClick={() => navigate(eventDetailPath(event.id))}
        onMouseEnter={(domEvent) => showTooltip(event, domEvent)}
        onMouseLeave={hideTooltip}
        onFocus={(domEvent) => showTooltip(event, domEvent)}
        onBlur={hideTooltip}
        aria-label={`${event.title}, ${event.lockLabel}, ${event.guests} guests`}
      >
        <i />
        {continues ? (
          <span className="home-cal-chip-time">→</span>
        ) : event.startsAt != null ? (
          <span className="home-cal-chip-time">
            {formatTime(event.startsAt)}
          </span>
        ) : null}
        <span className="home-cal-chip-title">{event.title}</span>
      </button>
    );
  };

  return (
    <div className="home-cal">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Home · Calendar</p>
          <h1 className="font-display mt-1 text-4xl leading-none tracking-tight text-ink">
            {monthLabel(cursor.year, cursor.month)}
          </h1>
          <div className="fact-row mt-3">
            <span className="fact">
              <b>This month:</b>
              {inMonth} events
            </span>
            {unscheduled.length > 0 ? (
              <span className="fact">
                <b>Unscheduled:</b>
                {unscheduled.length}
              </span>
            ) : null}
            {selected ? (
              <span className="fact">
                <b>Selected:</b>
                {selected.title}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/events/tracker" className="btn btn-ghost">
            Event tracker
          </Link>
          <Link to="/today" className="btn btn-ghost">
            Today’s service
          </Link>
          <Link to={eventsIndexPath()} className="btn btn-ghost">
            All events
          </Link>
          <div className="home-cal-nav">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => move(-1)}
              aria-label="Previous month"
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={jumpToday}
            >
              Today
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => move(1)}
              aria-label="Next month"
            >
              <ChevronRightIcon />
            </button>
          </div>
        </div>
      </div>

      <div className="home-cal-legend" role="group" aria-label="Lock status">
        {LOCK_ORDER.map((lock) => (
          <button
            key={lock}
            type="button"
            className="home-cal-legend-item"
            data-lock={lock}
            data-active={
              lockFilter.size === 0 || lockFilter.has(lock) || undefined
            }
            aria-pressed={lockFilter.has(lock)}
            onClick={() => toggleLock(lock)}
          >
            <i />
            {LOCK_LABEL[lock]}
          </button>
        ))}
        {lockFilter.size > 0 ? (
          <button
            type="button"
            className="text-link text-sm"
            onClick={() => setLockFilter(new Set())}
          >
            Show all
          </button>
        ) : null}
      </div>

      <div className="home-cal-grid" role="grid" aria-label="Month calendar">
        <div className="home-cal-weekdays" role="row">
          {WEEKDAYS.map((day) => (
            <div key={day} role="columnheader">
              {day}
            </div>
          ))}
        </div>
        {weeks.map((week, index) => (
          <div key={index} className="home-cal-week" role="row">
            {week.map((cell) => {
              const expanded = expandedDay === cell.dayStart;
              const visible = expanded
                ? cell.events
                : cell.events.slice(0, MAX_VISIBLE);
              const hidden = cell.events.length - visible.length;
              return (
                <div
                  key={cell.dayStart}
                  role="gridcell"
                  className="home-cal-day"
                  data-out={!cell.inMonth || undefined}
                  data-today={cell.dayStart === today || undefined}
                  data-expanded={expanded || undefined}
                >
                  <div className="home-cal-day-head">
                    <span>{new Date(cell.dayStart).getDate()}</span>
                    {cell.events.length > 0 ? (
                      <small>{cell.events.length}</small>
                    ) : null}
                  </div>
                  <div className="home-cal-day-body">
                    {visible.map((event) => chip(event, cell.dayStart))}
                    {hidden > 0 ? (
                      <button
                        type="button"
                        className="home-cal-more"
                        onClick={() => setExpandedDay(cell.dayStart)}
                      >
                        +{hidden} more
                      </button>
                    ) : expanded && cell.events.length > MAX_VISIBLE ? (
                      <button
                        type="button"
                        className="home-cal-more"
                        onClick={() => setExpandedDay(null)}
                      >
                        Show less
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {unscheduled.length > 0 ? (
        <div className="mt-6">
          <div className="section-rule">
            <span>No date yet</span>
            <i />
            <em>{unscheduled.length} events</em>
          </div>
          <div className="home-cal-unscheduled">
            {unscheduled.map((event) => chip(event, 0))}
          </div>
        </div>
      ) : null}

      {hover ? (
        <EventTooltip
          hover={{
            ...hover,
            // Read the hovered event from live facts so a saved vehicle change
            // shows at once and the next change carries the current version.
            event:
              facts.find((row) => row.id === hover.event.id) ?? hover.event,
          }}
          reports={reports}
          onReportAction={launchReport}
          vehicles={vehicleOptions}
          vehicleBusyId={vehicleBusyId}
          vehicleError={vehicleError}
          canAssignVehicle={canAssignDeliveryVehicle(authStatus?.role)}
          onVehicleChange={changeVehicle}
          onEnter={cancelTooltipHide}
          onLeave={hideTooltip}
          onFocus={cancelTooltipHide}
          onBlur={hideTooltip}
        />
      ) : null}
    </div>
  );
}
