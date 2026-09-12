import { useMemo, useState, type FocusEvent, type MouseEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatTime } from "../../lib/format";
import {
  useListClient,
  useListDelivery,
  useListEvent,
  useListInvoice,
  useListPerson,
  useListServiceStyle,
  useListVehicle,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { ChevronLeftIcon, ChevronRightIcon } from "../../ui/icons";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { eventDetailPath, eventsIndexPath } from "../events/eventRoutes";
import { EventReportRail } from "./EventReportRail";
import {
  buildCalendarFacts,
  buildMonthGrid,
  LOCK_LABEL,
  LOCK_ORDER,
  startOfDay,
  unscheduledEvents,
  type CalendarEventFacts,
} from "./homeCalendar";
import "./HomeCalendar.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_VISIBLE = 4;
const TOOLTIP_WIDTH = 300;

type Hover = { event: CalendarEventFacts; top: number; left: number };

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
function EventTooltip({ hover }: { hover: Hover }) {
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
      role="tooltip"
      className="home-cal-tooltip"
      data-lock={event.lock}
      style={{ top: hover.top, left: hover.left, width: TOOLTIP_WIDTH }}
    >
      <div className="home-cal-tooltip-head">
        <strong>{event.title}</strong>
        <span className="home-cal-lock-pill" data-lock={event.lock}>
          {event.lockLabel}
        </span>
      </div>
      <dl>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function tooltipPosition(target: HTMLElement): { top: number; left: number } {
  const rect = target.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(rect.left, window.innerWidth - TOOLTIP_WIDTH - 8),
  );
  const below = rect.bottom + 6;
  // 300px is a generous card height; flip above when it will not fit below.
  const top = below + 300 > window.innerHeight ? rect.top - 306 : below;
  return { top: Math.max(8, top), left };
}

/**
 * Home: the month at a glance. Every event sits on its day, coloured by
 * whether sales can still change it. Hover for the facts, click to load the
 * report rail, double-click to open the event.
 */
export function HomeCalendarPage() {
  const navigate = useNavigate();
  const events = useListEvent();
  const clients = useListClient();
  const venues = useListVenue();
  const deliveries = useListDelivery();
  const vehicles = useListVehicle();
  const serviceStyles = useListServiceStyle();
  const people = useListPerson();
  const invoices = useListInvoice();

  const today = startOfDay(Date.now());
  const [cursor, setCursor] = useState(() => {
    const d = new Date(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [lockFilter, setLockFilter] = useState<Set<string>>(new Set());

  const loading = [
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
  const inMonth = weeks
    .flat()
    .filter((cell) => cell.inMonth)
    .reduce((sum, cell) => sum + cell.events.length, 0);

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

  const showTooltip = (
    event: CalendarEventFacts,
    domEvent: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
  ) => setHover({ event, ...tooltipPosition(domEvent.currentTarget) });
  const hideTooltip = () => setHover(null);

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
          setSelectedId(event.id);
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

      {hover ? <EventTooltip hover={hover} /> : null}
      <EventReportRail event={selected} />
    </div>
  );
}
