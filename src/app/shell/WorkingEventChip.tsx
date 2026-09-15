import { useEffect } from "react";
import { Link } from "react-router-dom";
import { formatDate } from "../../lib/format";
import { useGetEvent } from "../../lib/manifest-convex-react";
import {
  eventDetailPath,
  eventsIndexPath,
} from "../../features/events/eventRoutes";
import {
  setWorkingEvent,
  useWorkingEventId,
} from "../../features/events/workingEvent";

/**
 * Top-bar marker for the working event. Screens that show event data start
 * on this event; clear it to see every event again.
 */
export function WorkingEventChip() {
  const id = useWorkingEventId();
  const event = useGetEvent(id ?? "skip");
  const gone = id != null && (event === null || event?.deletedAt != null);
  useEffect(() => {
    if (gone) setWorkingEvent(null);
  }, [gone]);
  if (!id || !event || event.deletedAt != null) return null;
  return (
    <div className="flex h-9 min-w-0 items-center gap-1 rounded-full border border-brand/40 bg-brand/10 pr-1 pl-3 text-sm">
      <Link
        to={eventDetailPath(event._id)}
        className="flex min-w-0 items-center gap-2 text-ink hover:underline"
        title="Open the working event"
      >
        <span className="shrink-0 text-2xs font-semibold tracking-[0.04em] text-ink-2 uppercase max-lg:hidden">
          Working on
        </span>
        <strong className="max-w-56 truncate font-semibold max-sm:max-w-28">
          {event.title}
        </strong>
        <span className="shrink-0 text-ink-2 max-md:hidden">
          {formatDate(event.startsAt)}
        </span>
      </Link>
      <Link
        to={eventsIndexPath()}
        className="shrink-0 rounded-full px-2 text-xs text-ink-2 hover:bg-inset hover:text-ink max-sm:hidden"
      >
        Change
      </Link>
      <button
        type="button"
        onClick={() => setWorkingEvent(null)}
        aria-label="Clear the working event"
        title="Clear the working event"
        className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-full text-ink-3 hover:bg-inset hover:text-ink"
      >
        ×
      </button>
    </div>
  );
}
