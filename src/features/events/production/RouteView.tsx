import type { Doc, Id } from "../../../lib/api";
import { useEventRoute } from "../../../lib/useEventRoute";
import { EosPanel } from "../../eos/EosShared";
import { directionsUrl } from "../EventRouteMapPage";

type Rig = Doc<"eventVehicleAssignments">;

type Endpoint = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
};

const place = (point: Endpoint) =>
  point.latitude != null && point.longitude != null
    ? `${point.latitude},${point.longitude}`
    : point.address;

/**
 * Route view: Google's keyless map of the drive from the kitchen to the
 * venue, next to every truck on the event with its driver, riders and load.
 */
export function RouteView({
  eventId,
  rigs,
  riders,
  cargo,
  truckName,
  nameOf,
}: {
  eventId: string;
  rigs: readonly Rig[];
  riders: (rigId: string) => number;
  cargo: (rigId: string) => number;
  truckName: (rig: Rig) => string;
  nameOf: (personId: string) => string;
}) {
  const route = useEventRoute(eventId as Id<"events">);
  const origin =
    route?.origin.ok === true ? (route.origin.endpoint as Endpoint) : null;
  const destination =
    route?.destination.ok === true
      ? (route.destination.endpoint as Endpoint)
      : null;
  const frame =
    destination != null
      ? origin != null
        ? `https://maps.google.com/maps?saddr=${encodeURIComponent(place(origin))}&daddr=${encodeURIComponent(place(destination))}&output=embed`
        : `https://maps.google.com/maps?q=${encodeURIComponent(place(destination))}&output=embed`
      : null;
  const live = rigs.filter(
    (row) => row.deletedAt == null && row.activeEventId === eventId,
  );

  return (
    <EosPanel
      tone="people"
      eyebrow="Route"
      title={
        origin && destination
          ? `${origin.name} to ${destination.name}`
          : "Kitchen to venue"
      }
      lead="The drive the trucks make, and who is on each one."
      actions={
        origin && destination ? (
          <a
            className="btn btn-ghost"
            href={directionsUrl(origin, destination)}
            target="_blank"
            rel="noreferrer"
          >
            Open in Google Maps
          </a>
        ) : null
      }
    >
      <div className="pb-route">
        {frame ? (
          <iframe
            className="pb-route-map"
            title="Route from the kitchen to the venue"
            src={frame}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <p className="pb-route-map pb-plan-empty">
            {route === undefined
              ? "Loading the route…"
              : "This event has no venue address yet."}
          </p>
        )}
        <div className="grid content-start gap-2">
          <p className="pb-heading">Fleet on this event ({live.length})</p>
          {live.length === 0 ? (
            <p className="text-sm text-ink-3">
              No trucks yet. Add them in the Equipment room view.
            </p>
          ) : (
            live.map((rig) => (
              <div key={rig._id} className="pb-card">
                <div className="pb-card-head">
                  <strong>{truckName(rig)}</strong>
                  <span className="pb-chip">
                    {rig.preloadedAt ? "Loaded" : "Not loaded"}
                  </span>
                </div>
                <span>
                  Driver:{" "}
                  {rig.driverId ? nameOf(String(rig.driverId)) : "Not set"}
                </span>
                <span className="text-ink-3">
                  {riders(String(rig._id))} riding · {cargo(String(rig._id))}{" "}
                  lines of gear
                  {rig.loadingZone ? ` · loads at ${rig.loadingZone}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </EosPanel>
  );
}
