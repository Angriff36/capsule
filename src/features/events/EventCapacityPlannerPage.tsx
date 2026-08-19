import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { formatCount, formatCountNoun, formatTime } from "../../lib/format";
import {
  useListEvent,
  useListEventGuest,
  useListVenue,
} from "../../lib/manifest-convex-react";
import { ArrowLeftIcon } from "../../ui/icons";
import { TableSkeleton } from "../../ui/primitives";
import {
  addLocalDays,
  buildCapacityPlan,
  localDateInput,
  startOfLocalDay,
  type CapacityEventCard,
} from "./eventCapacityPlanner";
import "./EventCapacityPlannerPage.css";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthDay = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const fullDate = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

const HEAT_LABEL = {
  unknown: "Capacity not recorded",
  quiet: "Under 35%",
  steady: "35–69%",
  busy: "70–99%",
  full: "At or over capacity",
} as const;

function defaultRange() {
  const today = startOfLocalDay(Date.now());
  return {
    startDate: localDateInput(today),
    endDate: localDateInput(addLocalDays(today, 27)),
  };
}

function CapacityTile({ card }: { card: CapacityEventCard }) {
  const { event } = card;
  const occupancy =
    card.capacity == null
      ? "Capacity not set"
      : `${formatCount(card.confirmedHeadcount)} / ${formatCount(card.capacity)}`;
  const accessibleOccupancy =
    card.capacity == null
      ? `${card.confirmedHeadcount} confirmed guests; capacity not recorded`
      : `${card.confirmedHeadcount} confirmed guests of ${card.capacity} capacity`;

  return (
    <Link
      to={`/events/${event._id}`}
      className="capacity-event-tile"
      data-heat={card.heat}
      aria-label={`${event.title}: ${accessibleOccupancy}${card.conflictingEventIds.length ? "; venue booking conflict" : ""}`}
    >
      <span className="capacity-event-time">{formatTime(event.startsAt)}</span>
      <strong>{event.title}</strong>
      <span className="capacity-event-venue">
        {event.venueName || "Venue not assigned"}
      </span>
      <span className="capacity-event-meter" aria-hidden="true">
        <span
          style={{
            width: `${Math.min((card.utilization ?? 0) * 100, 100)}%`,
          }}
        />
      </span>
      <span className="capacity-event-count">
        <b>{occupancy}</b>
        <small>
          {card.capacity == null
            ? `${formatCount(event.expectedHeadcount)} expected`
            : card.utilization == null
              ? "—"
              : percent.format(card.utilization)}
        </small>
      </span>
      {card.conflictingEventIds.length ? (
        <span className="capacity-conflict-flag">
          Shared venue overlap · {card.conflictingEventIds.length}
        </span>
      ) : null}
    </Link>
  );
}

export function EventCapacityPlannerPage() {
  const initial = useMemo(defaultRange, []);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const events = useListEvent();
  const guests = useListEventGuest();
  const venues = useListVenue();
  const loading =
    events === undefined || guests === undefined || venues === undefined;
  const plan = useMemo(
    () =>
      buildCapacityPlan({
        events: events ?? [],
        guests: guests ?? [],
        venues: venues ?? [],
        startDate,
        endDate,
      }),
    [endDate, events, guests, startDate, venues],
  );
  const firstDayOffset = plan.days[0]
    ? new Date(plan.days[0].startsAt).getDay()
    : 0;

  return (
    <div className="capacity-planner">
      <Link to="/events" className="capacity-back-link">
        <ArrowLeftIcon width={12} height={12} /> All events
      </Link>

      <header className="capacity-masthead">
        <div>
          <p className="eyebrow">Event ops · Capacity calendar</p>
          <h1>See the room before it fills.</h1>
          <p>
            Confirmed RSVPs meet the venue limit here—along with every shared
            room booking that needs a second look.
          </p>
        </div>
        <div
          className="capacity-range-controls"
          aria-label="Calendar date range"
        >
          <label>
            From
            <BoundedDateInput
              value={startDate}
              max={endDate}
              onChange={(event) => setStartDate(event.target.value)}
              data-testid="capacity-range-start"
            />
          </label>
          <span aria-hidden="true">→</span>
          <label>
            Through
            <BoundedDateInput
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              data-testid="capacity-range-end"
            />
          </label>
        </div>
      </header>

      {!plan.valid ? (
        <div className="capacity-range-error" role="alert">
          Choose an end date on or after the start date.
        </div>
      ) : null}

      <section className="capacity-scoreboard" aria-label="Capacity summary">
        <article>
          <span>Events in range</span>
          <strong data-testid="capacity-event-count">
            {formatCount(plan.events.length)}
          </strong>
          <small>active bookings</small>
        </article>
        <article>
          <span>Confirmed</span>
          <strong>{formatCount(plan.confirmedHeadcount)}</strong>
          <small>guest RSVPs</small>
        </article>
        <article>
          <span>Recorded capacity</span>
          <strong>{formatCount(plan.recordedCapacity)}</strong>
          <small>seats across events</small>
        </article>
        <article className={plan.conflicts.length ? "is-alert" : undefined}>
          <span>Venue conflicts</span>
          <strong data-testid="capacity-conflict-count">
            {formatCount(plan.conflicts.length)}
          </strong>
          <small>
            {plan.overCapacityCount
              ? `${plan.overCapacityCount} also over capacity`
              : "overlapping bookings"}
          </small>
        </article>
      </section>

      <section className="capacity-legend" aria-label="Occupancy heat legend">
        <span className="eyebrow">Confirmed ÷ capacity</span>
        {(
          Object.entries(HEAT_LABEL) as [keyof typeof HEAT_LABEL, string][]
        ).map(([heat, label]) => (
          <span key={heat} className="capacity-legend-item">
            <i data-heat={heat} /> {label}
          </span>
        ))}
      </section>

      <section
        className="capacity-calendar-shell"
        aria-label="Capacity heat map"
      >
        {loading ? (
          <TableSkeleton rows={8} />
        ) : plan.days.length === 0 ? (
          <div className="capacity-empty">
            <strong>No calendar range to show.</strong>
            <span>Choose a valid start and end date above.</span>
          </div>
        ) : (
          <div className="capacity-calendar-scroll">
            <div className="capacity-calendar" role="grid">
              {Array.from({ length: 7 }, (_, index) => (
                <div
                  key={index}
                  className="capacity-weekday"
                  role="columnheader"
                >
                  {weekday.format(new Date(2026, 6, 19 + index))}
                </div>
              ))}
              {Array.from({ length: firstDayOffset }, (_, index) => (
                <div
                  key={`blank-${index}`}
                  className="capacity-day is-outside"
                  aria-hidden="true"
                />
              ))}
              {plan.days.map((day) => (
                <article
                  key={day.key}
                  className={`capacity-day${day.events.length ? " has-events" : ""}`}
                  role="gridcell"
                  aria-label={`${fullDate.format(day.startsAt)}, ${formatCountNoun(day.events.length, "event")}`}
                  data-testid={`capacity-day-${day.key}`}
                >
                  <header>
                    <span>{weekday.format(day.startsAt)}</span>
                    <strong>{monthDay.format(day.startsAt)}</strong>
                    <small>{day.events.length || ""}</small>
                  </header>
                  <div className="capacity-day-events">
                    {day.events.map((card) => (
                      <CapacityTile key={card.event._id} card={card} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {plan.conflicts.length ? (
        <section
          className="capacity-conflict-ledger"
          aria-labelledby="conflict-title"
        >
          <header>
            <p className="eyebrow">Needs a second look</p>
            <h2 id="conflict-title">Shared venue overlaps</h2>
            <p>
              These are warnings, not roadblocks. Confirm the room plan or move
              one booking when the overlap is unintentional.
            </p>
          </header>
          <ol>
            {plan.conflicts.map(({ first, second }) => (
              <li key={`${first._id}-${second._id}`}>
                <span>
                  <b>{first.venueName || "Shared venue"}</b>
                  <small>
                    {localDateInput(first.startsAt ?? 0)} ·{" "}
                    {formatTime(first.startsAt)}–{formatTime(first.endsAt)}
                  </small>
                </span>
                <span>
                  <Link to={`/events/${first._id}`}>{first.title}</Link>
                  <i aria-hidden="true">↔</i>
                  <Link to={`/events/${second._id}`}>{second.title}</Link>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
