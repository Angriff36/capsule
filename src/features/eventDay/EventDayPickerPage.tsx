import { Link } from "react-router-dom";
import "./EventDay.css";
import {
  useEventDayEvents,
  type EventDayEventSummary,
} from "../../lib/eventDayBriefing";
import { formatStatusLabel } from "../../lib/statusLabels";
import { useWorkingEventId } from "../events/workingEvent";

function dayStart(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function EventCard({
  event,
  today,
}: {
  event: EventDayEventSummary;
  today: boolean;
}) {
  const at =
    typeof event.startsAt === "number" ? new Date(event.startsAt) : null;
  const place = String(event.venueName ?? "").trim();
  const guests =
    event.expectedHeadcount != null ? `${event.expectedHeadcount} guests` : "";
  return (
    <Link
      to={`/event-day/${event._id}`}
      className={`eday-pick-card ${today ? "eday-pick-today" : ""}`}
    >
      <span className="eday-pick-date">
        <span className="eday-pick-month">
          {at ? at.toLocaleDateString(undefined, { month: "short" }) : "TBD"}
        </span>
        <span className="eday-pick-day">{at ? at.getDate() : "—"}</span>
      </span>
      <span className="eday-pick-main">
        <span className="eday-pick-title">
          {String(event.title ?? "Event")}
        </span>
        <span className="eday-pick-sub2">
          {[place, guests].filter(Boolean).join(" · ") || "Details to come"}
        </span>
      </span>
      <span className="eday-pick-stage">
        {today ? "Today" : formatStatusLabel(String(event.stage))}
      </span>
    </Link>
  );
}

/**
 * Event Day home: pick the event you are working. Today's events wear the
 * gold rim; upcoming events follow in date order, recent ones sit below.
 * Reads the day-of briefing seam, so every crew role sees the shelf.
 */
export function EventDayPickerPage() {
  const events = useEventDayEvents();
  const workingId = useWorkingEventId();
  const todayStart = dayStart(Date.now());

  const rows = (events ?? []).filter(
    (row) => !["cancelled", "closed_out"].includes(String(row.stage)),
  );
  // The event the operator is already working sits first.
  const working = rows.find((row) => row._id === workingId);
  const dated = rows.filter(
    (row) => typeof row.startsAt === "number" && row !== working,
  );
  const upcoming = dated
    .filter((row) => dayStart(Number(row.startsAt)) >= todayStart)
    .sort((a, b) => Number(a.startsAt) - Number(b.startsAt));
  const past = dated
    .filter((row) => dayStart(Number(row.startsAt)) < todayStart)
    .sort((a, b) => Number(b.startsAt) - Number(a.startsAt))
    .slice(0, 8);

  return (
    <div className="eday">
      <div className="eday-frame">
        <header className="eday-pick-head">
          <h1 className="eday-wordmark">Event Day</h1>
          <p className="eday-pick-sub">
            The crew map. Pick your event — sections light up as the plan locks
            in.
          </p>
        </header>
        <div className="eday-pick-list">
          {events === undefined ? (
            <p className="eday-empty">Lighting the estate…</p>
          ) : events === null ? (
            <p className="eday-empty">
              Your sign-in is not linked to a workspace yet — ask a manager to
              add you.
            </p>
          ) : !working && upcoming.length === 0 && past.length === 0 ? (
            <p className="eday-empty">No events on the calendar yet.</p>
          ) : (
            <>
              {working ? (
                <>
                  <p className="eday-kicker">Your working event</p>
                  <EventCard
                    event={working}
                    today={
                      typeof working.startsAt === "number" &&
                      dayStart(working.startsAt) === todayStart
                    }
                  />
                </>
              ) : null}
              {upcoming.map((row) => (
                <EventCard
                  key={row._id}
                  event={row}
                  today={dayStart(Number(row.startsAt)) === todayStart}
                />
              ))}
              {past.length > 0 ? (
                <>
                  <p className="eday-kicker">Recently wrapped</p>
                  {past.map((row) => (
                    <EventCard key={row._id} event={row} today={false} />
                  ))}
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
