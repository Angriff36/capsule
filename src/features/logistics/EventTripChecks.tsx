import {
  useListTrailer,
  useListVehicle,
} from "../../lib/manifest-convex-react";
import { useActiveEventRigs } from "../facilities/useLogisticsWindow";
import { TripCheckPanel } from "./TripCheckPanel";
import { packRigs } from "./usePackRigs";

/**
 * The trucks and trailers on one event, each with its trip checks. Vendor
 * drops are left out: an outside vendor checks its own truck. Shown whether
 * or not the event's timing is planned, so a driver can always record a
 * check.
 */
export function EventTripChecks({ eventId }: { eventId: string }) {
  const assignments = useActiveEventRigs(eventId);
  const vehicles = useListVehicle();
  const trailers = useListTrailer();
  if (!assignments || !vehicles || !trailers) return null;

  const ours = assignments.filter(
    (row) => row.vehicleId != null || row.trailerId != null,
  );
  const rigs = packRigs(eventId, ours, vehicles, trailers);

  return (
    <section
      className="border-b border-line pb-5"
      aria-label="Trip checks"
      data-testid="event-trip-checks"
    >
      <h2 className="text-xl font-semibold">Trip checks</h2>
      <p className="mt-1 text-base text-ink-2">
        Check each truck before it leaves and after it comes back. A new check
        takes the place of the old one here.
      </p>
      {rigs.length === 0 ? (
        <p className="mt-3 text-base text-ink-2">
          No truck or trailer is on this event yet. Attach one on the Event
          tracker.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {rigs.map((rig) => (
            <li key={rig.id} className="py-3">
              <p className="text-base font-semibold">{rig.label}</p>
              <TripCheckPanel runId={rig.id} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
