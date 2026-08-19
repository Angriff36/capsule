import { formatDate, formatTime } from "../../../lib/format";
import type { KitchenCommandDeckModel } from "./KitchenCommandDeckModel";
import type { EventLike } from "./KitchenCommandDeckTypes";

type Props = Readonly<{
  model: KitchenCommandDeckModel;
  events: EventLike[];
  selectedEventId: string;
  onSelect: (eventId: string) => void;
  venueName: (venueId: string | null | undefined) => string;
  nextEvent?: EventLike | null;
  onJumpToEvent?: (event: EventLike) => void;
}>;

export function KitchenCommandDeckEventRail({
  model,
  events,
  selectedEventId,
  onSelect,
  venueName,
  nextEvent,
  onJumpToEvent,
}: Props) {
  if (events.length === 0) {
    return (
      <div className="kcd-empty">
        <p>No events in this window.</p>
        {nextEvent && onJumpToEvent ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2"
            onClick={() => onJumpToEvent(nextEvent)}
            data-testid="command-deck-jump-next-event"
          >
            Next: {nextEvent.title} · {formatDate(nextEvent.startsAt)} — jump
            there
          </button>
        ) : (
          <p className="mt-1">Pick a date above or add events.</p>
        )}
      </div>
    );
  }

  return (
    <div className="kcd-event-list" data-testid="command-deck-event-rail">
      {events.map((event, index) => {
        const progress = model.progress(event._id);
        const selected = event._id === selectedEventId;
        return (
          <button
            key={event._id}
            type="button"
            onClick={() => onSelect(event._id)}
            className={`kcd-event-ticket${selected ? " is-selected" : ""}`}
            style={{ ["--delay" as string]: `${index * 45}ms` }}
            data-testid="command-deck-event-card"
            aria-pressed={selected}
          >
            <div className="kcd-event-top">
              <span className="kcd-event-title">{event.title}</span>
              <span className="kcd-event-pct">{progress.pct}%</span>
            </div>
            <p className="kcd-event-meta">
              {formatDate(event.startsAt)} · {formatTime(event.startsAt)}
              <br />
              {venueName(event.venueId)} · {event.expectedHeadcount ?? "—"}{" "}
              guests
            </p>
            <div className="kcd-progress" aria-hidden="true">
              <i style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="kcd-event-foot">
              {progress.total === 0
                ? "No prep tasks yet"
                : `${progress.completed}/${progress.total} steps done`}
            </p>
          </button>
        );
      })}
    </div>
  );
}
