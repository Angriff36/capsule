import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Id } from "../../lib/api";
import { publicErrorMessage } from "../../lib/publicErrorMessage";
import { EventOverviewCard } from "./EventOverviewCard";

/**
 * PL-CONNECTIONS (AC-121): when Google Calendar did not take this event, the
 * event says so - the event itself stays saved and editable. Shows nothing
 * when the calendar is not connected or the event is on it; the note goes
 * away by itself once a later send succeeds.
 */
export function EventCalendarSyncNote({
  eventId,
}: {
  readonly eventId: Id<"events">;
}) {
  const marker = useQuery(api.googleCalendarHealth.eventSyncMarker, {
    eventId,
  });
  const retryEvent = useAction(api.googleCalendar.retryEvent);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  if (!marker || marker.status !== "failed") return null;

  async function retry() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await retryEvent({ eventId });
      if (result.status === "failed") {
        setMessage(
          `Still not sent: ${result.error ?? "no reason given"}. Capsule keeps trying by itself.`,
        );
      }
    } catch (cause) {
      setMessage(publicErrorMessage(cause, "It could not be sent again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <EventOverviewCard
      title="Google Calendar"
      testId="event-calendar-sync-note"
      aside={<span className="chip chip-tone-warn">Not on the calendar</span>}
    >
      <p className="text-sm text-ink-2">
        This event is saved, but Google Calendar did not take it
        {marker.error ? `: ${marker.error}` : "."} Capsule tries again by
        itself.
      </p>
      {message ? <p className="mt-2 text-sm text-warn">{message}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {marker.canRetry ? (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => void retry()}
          >
            {busy ? "Sending…" : "Try again now"}
          </button>
        ) : null}
        <Link className="text-sm text-ink-2 underline" to="/admin/integrations">
          Calendar connection
        </Link>
      </div>
    </EventOverviewCard>
  );
}
