import { formatDate, formatTime } from "../../../lib/format";
import type { KitchenCommandDeckModel } from "./KitchenCommandDeckModel";
import type { EventLike } from "./KitchenCommandDeckTypes";

type Props = Readonly<{
  model: KitchenCommandDeckModel;
  events: EventLike[];
  selectedEventId: string;
  onSelect: (eventId: string) => void;
  venueName: (venueId: string | null | undefined) => string;
}>;

export function KitchenCommandDeckEventRail({
  model,
  events,
  selectedEventId,
  onSelect,
  venueName,
}: Props) {
  if (events.length === 0) {
    return (
      <p className="kcd-empty">
        No events in the next 7 days. Shift the horizon or add events.
      </p>
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
