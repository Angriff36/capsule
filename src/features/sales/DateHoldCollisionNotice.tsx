import { Link } from "react-router-dom";
import {
  useListClient,
  useListDateHold,
  useListDateWaitlistEntry,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { clientDisplayName } from "../events/clientName";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";
import { activeHoldsOn, waitlistFor } from "./dateHolds";

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
  const holds = useListDateHold();
  const waitlist = useListDateWaitlistEntry();
  const clients = useListClient();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;

  const now = Date.now();
  const active = activeHoldsOn(holds, dateKey, now).filter(
    (hold) => hold._id !== ignoreHoldId,
  );
  const waiting = waitlistFor(waitlist, dateKey);
  if (active.length === 0) return null;

  return (
    <div
      role="status"
      className="p-3 bg-warn-soft border border-warn/40 rounded-sm text-xs text-warn"
    >
      <p className="font-medium">
        This date already has{" "}
        {active.length === 1 ? "a hold" : `${active.length} holds`}
        {waiting.length > 0 ? ` and ${waiting.length} on the waitlist` : ""}.
      </p>
      <ul className="mt-1 list-disc pl-4">
        {active.map((hold) => (
          <li key={hold._id}>
            {hold.clientId
              ? clientDisplayName(hold.clientId, clients)
              : (hold.note ?? "Unnamed prospect")}{" "}
            — held until {formatDate(hold.expiresAt)}
          </li>
        ))}
      </ul>
      <Link to={CLIENTS_ROUTES.dateHolds} className="underline font-medium">
        See date holds →
      </Link>
    </div>
  );
}
