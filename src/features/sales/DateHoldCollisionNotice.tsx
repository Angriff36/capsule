import { Link, useLocation } from "react-router-dom";
import { useClientsByIds } from "../../lib/useClientDirectory";
import { useDayHolds } from "../../lib/financeScopedQueries";
import { formatDate } from "../../lib/format";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";
import { useEventsInRange } from "../facilities/useEventsById";
import { eventDetailPath } from "../events/eventRoutes";
import { activeHoldsOn, dateKeyToMs, waitlistFor } from "./dateHolds";

/**
 * Warn-only: names the soft holds (and waitlist) already on a date so sales
 * sees the collision before booking or holding it. Never blocks the save.
 */
export function DateHoldCollisionNotice({
  dateKey,
  ignoreHoldId,
}: {
  /** "YYYY-MM-DD"; nothing renders for an empty or partial value. */
  dateKey: string;
  ignoreHoldId?: string;
}) {
  const { pathname } = useLocation();
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
  // Only this day's holds and waitlist, and the clients holding them.
  const { holds, waitlist } = useDayHolds(validDate ? dateKey : null);
  const clients = useClientsByIds(
    [...(holds ?? []), ...(waitlist ?? [])].map((row) => row.clientId),
  );
  // Booked events that day: a hold on a date that already has an event is
  // worth knowing about too (the kitchen and staff are split).
  const dayStart = validDate ? dateKeyToMs(dateKey) - 12 * 3_600_000 : 0;
  const booked = useEventsInRange(
    validDate ? { from: dayStart, to: dayStart + 24 * 3_600_000 } : "skip",
  )?.filter((event) => String(event.stage) !== "cancelled");
  if (!validDate) return null;

  const now = Date.now();
  const active = activeHoldsOn(holds, dateKey, now).filter(
    (hold) => hold._id !== ignoreHoldId,
  );
  const waiting = waitlistFor(waitlist, dateKey);
  const events = booked ?? [];
  if (active.length === 0 && events.length === 0) return null;

  return (
    <div
      role="status"
      className="p-3 bg-warn-soft border border-warn/40 rounded-sm text-xs text-warn"
    >
      <p className="font-medium">
        This date already has{" "}
        {[
          events.length === 1
            ? "a booked event"
            : events.length > 1
              ? `${events.length} booked events`
              : null,
          active.length === 1
            ? "a hold"
            : active.length > 1
              ? `${active.length} holds`
              : null,
          waiting.length > 0 ? `${waiting.length} on the waitlist` : null,
        ]
          .filter(Boolean)
          .join(", ")}
        .
      </p>
      <ul className="mt-1 list-disc pl-4">
        {events.map((event) => (
          <li key={event._id}>
            <Link to={eventDetailPath(event._id)} className="underline">
              {event.title || "Untitled event"}
            </Link>{" "}
            — booked
          </li>
        ))}
        {active.map((hold) => (
          <li key={hold._id}>
            {hold.clientId
              ? clientDisplayName(hold.clientId, clients)
              : (hold.note ?? "Unnamed prospect")}{" "}
            — held until {formatDate(hold.expiresAt)}
          </li>
        ))}
      </ul>
      {pathname === CLIENTS_ROUTES.dateHolds ? null : (
        <Link to={CLIENTS_ROUTES.dateHolds} className="underline font-medium">
          See date holds →
        </Link>
      )}
    </div>
  );
}
