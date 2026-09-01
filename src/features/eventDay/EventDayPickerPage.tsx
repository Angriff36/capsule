import { Link } from "react-router-dom";
import "./EventDay.css";
import {
  useEventDayEvents,
  type EventDayEventSummary,
} from "../../lib/eventDayBriefing";
import { formatStatusLabel } from "../../lib/statusLabels";

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
      className={`evd-pick-card ${today ? "evd-pick-today" : ""}`}
    >
      <span className="evd-pick-date">
        <span className="evd-pick-month">
          {at ? at.toLocaleDateString(undefined, { month: "short" }) : "TBD"}
        </span>
        <span className="evd-pick-day">{at ? at.getDate() : "—"}</span>
      </span>
      <span className="evd-pick-main">
        <span className="evd-pick-title">{String(event.title ?? "Event")}</span>
        <span className="evd-pick-sub2">
          {[place, guests].filter(Boolean).join(" · ") || "Details to come"}
        </span>
      </span>
      <span className="evd-pick-stage">
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
  const todayStart = dayStart(Date.now());

  const rows = (events ?? []).filter(
    (row) => !["cancelled", "closed_out"].includes(String(row.stage)),
  );
  const dated = rows.filter((row) => typeof row.startsAt === "number");
  const upcoming = dated
    .filter((row) => dayStart(Number(row.startsAt)) >= todayStart)
    .sort((a, b) => Number(a.startsAt) - Number(b.startsAt));
  const past = dated
    .filter((row) => dayStart(Number(row.startsAt)) < todayStart)
    .sort((a, b) => Number(b.startsAt) - Number(a.startsAt))
    .slice(0, 8);

  return (
    <div className="evd">
      <div className="evd-frame">
        <header className="evd-pick-head">
          <p className="evd-wordmark">Event Day</p>
          <p className="evd-pick-sub">
            The crew map. Pick your event — sections light up as the plan locks
            in.
          </p>
        </header>
        <div className="evd-pick-list">
          {events === undefined ? (
            <p className="evd-empty">Lighting the estate…</p>
          ) : events === null ? (
            <p className="evd-empty">
              Your sign-in is not linked to a workspace yet — ask a manager to
              add you.
            </p>
          ) : upcoming.length === 0 && past.length === 0 ? (
            <p className="evd-empty">No events on the calendar yet.</p>
          ) : (
            <>
              {upcoming.map((row) => (
                <EventCard
                  key={row._id}
                  event={row}
                  today={dayStart(Number(row.startsAt)) === todayStart}
                />
              ))}
              {past.length > 0 ? (
                <>
                  <p className="evd-kicker">Recently wrapped</p>
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
