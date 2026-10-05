import type { useEventTransport } from "../../lib/useEventRouteLegs";
import { timeLabel } from "./EventTimingPlannerDraft";

type Transport = NonNullable<ReturnType<typeof useEventTransport>>;

function windowLabel(startsAt: number | null, endsAt: number | null) {
  if (startsAt != null && endsAt != null)
    return `${timeLabel(startsAt)} – ${timeLabel(endsAt)}`;
  if (startsAt != null) return `from ${timeLabel(startsAt)}`;
  if (endsAt != null) return `by ${timeLabel(endsAt)}`;
  return "time not known yet";
}

/**
 * One run's load against what the truck carries, and its stops with the
 * window and who is responsible (PL-DELIVERY, spec §13.3).
 */
export function EventRunStops({
  legId,
  transport,
  loadingZone,
}: {
  legId: string;
  transport: Transport | undefined;
  loadingZone: string | null;
}) {
  if (!transport) return null;
  const load = transport.rigLoads.find((rig) => rig.id === legId);
  const stops = transport.stops.filter((stop) => stop.legId === legId);
  if (!load && stops.length === 0 && !loadingZone) return null;
  const missing = stops.find((stop) => stop.crewMissing)?.crewMissing;
  return (
    <div className="mt-2 text-base">
      {loadingZone && <p>Loads at {loadingZone}.</p>}
      {load && (
        <p className={load.overKg > 0 ? "text-danger" : undefined}>
          {load.message ?? `Carries ${load.loadKg} of ${load.capacityKg} kg.`}
          {load.unweighed.length > 0 &&
            ` ${load.unweighed.length} ${load.unweighed.length === 1 ? "line has" : "lines have"} no weight yet and ${load.unweighed.length === 1 ? "is" : "are"} not counted.`}
        </p>
      )}
      {missing && (
        <p role="alert" className="text-danger">
          {missing}
        </p>
      )}
      {stops.length > 0 && (
        <ul className="mt-1 text-sm text-ink-2">
          {stops.map((stop) => (
            <li key={stop.kind}>
              {stop.label}: {windowLabel(stop.startsAt, stop.endsAt)}
              {stop.crew.length > 0 && ` · ${stop.crew.join(", ")}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
