import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListDelivery,
  useListEvent,
  useListVehicle,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import {
  geocodeDestination,
  routeLegs,
  suggestVisitOrder,
  type GeoPoint,
} from "./routePlanner";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";

const DAY_MS = 24 * 60 * 60 * 1000;

const toDateInputValue = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const formatTime = (epoch: number) =>
  new Date(epoch).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

type DeliveryRow = {
  _id: string;
  destination: string;
  eventId: string;
  vehicleId?: string | null;
  windowStartsAt?: number | null;
  windowEndsAt?: number | null;
  status: unknown;
  deletedAt?: number | null;
};

type VehicleRow = {
  _id: string;
  registration: string;
  make: string;
  model: string;
  deletedAt?: number | null;
};

export function RoutePlannerPage() {
  const vehicles = useListVehicle() as VehicleRow[] | undefined;
  const deliveries = useListDelivery() as DeliveryRow[] | undefined;
  const events = useListEvent();
  const [day, setDay] = useState(() => toDateInputValue(new Date()));
  const [vehicleId, setVehicleId] = useState("");
  const [coords, setCoords] = useState<ReadonlyMap<string, GeoPoint>>(
    () => new Map(),
  );
  const [geocoding, setGeocoding] = useState(false);
  const [manualOrder, setManualOrder] = useState<string[] | null>(null);

  const dayStart = new Date(`${day}T00:00`).getTime();
  const dayEnd = dayStart + DAY_MS;

  const fleet = (vehicles ?? []).filter((vehicle) => vehicle.deletedAt == null);
  const stops = useMemo(
    () =>
      (deliveries ?? [])
        .filter(
          (row) =>
            row.deletedAt == null &&
            row.vehicleId === vehicleId &&
            (String(row.status) === "scheduled" ||
              String(row.status) === "in_transit") &&
            row.windowStartsAt != null &&
            row.windowEndsAt != null &&
            row.windowStartsAt < dayEnd &&
            row.windowEndsAt > dayStart,
        )
        .sort((a, b) => (a.windowStartsAt ?? 0) - (b.windowStartsAt ?? 0)),
    [deliveries, vehicleId, dayStart, dayEnd],
  );

  // Default to the first vehicle that has runs on the selected day.
  useEffect(() => {
    if (vehicleId || !vehicles || !deliveries) return;
    const withRuns = fleet.find((vehicle) =>
      deliveries.some(
        (row) =>
          row.deletedAt == null &&
          row.vehicleId === vehicle._id &&
          row.windowStartsAt != null &&
          row.windowStartsAt < dayEnd &&
          (row.windowEndsAt ?? 0) > dayStart,
      ),
    );
    setVehicleId((withRuns ?? fleet[0])?._id ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles, deliveries]);

  // Geocode every destination on the route (cached in localStorage).
  const destinationsKey = stops.map((stop) => stop.destination).join("\n");
  useEffect(() => {
    if (stops.length === 0) {
      setCoords(new Map());
      return;
    }
    let cancelled = false;
    setGeocoding(true);
    void Promise.all(
      stops.map(async (stop) => ({
        id: stop._id,
        point: await geocodeDestination(stop.destination),
      })),
    ).then((results) => {
      if (cancelled) return;
      const next = new Map<string, GeoPoint>();
      for (const { id, point } of results) if (point) next.set(id, point);
      setCoords(next);
      setGeocoding(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationsKey]);

  const suggested = useMemo(
    () =>
      suggestVisitOrder(
        stops.map((stop) => ({
          id: stop._id,
          destination: stop.destination,
          windowStartsAt: stop.windowStartsAt,
        })),
        coords,
      ),
    [stops, coords],
  );

  // Manual reorder is kept only while it still matches the current stop set.
  const order =
    manualOrder &&
    manualOrder.length === suggested.length &&
    manualOrder.every((id) => suggested.includes(id))
      ? manualOrder
      : suggested;

  const move = (index: number, delta: number) => {
    const next = [...order];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setManualOrder(next);
  };

  const stopById = new Map(stops.map((stop) => [stop._id, stop]));
  const orderedStops = order
    .map((id) => stopById.get(id))
    .filter((stop): stop is DeliveryRow => stop != null);
  const legs = routeLegs(order, coords);
  const totalKm = legs.reduce((sum, leg) => sum + (leg?.distanceKm ?? 0), 0);
  const totalMinutes = legs.reduce((sum, leg) => sum + (leg?.minutes ?? 0), 0);
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";
  const selectedVehicle = fleet.find((vehicle) => vehicle._id === vehicleId);
  const loading =
    vehicles === undefined || deliveries === undefined || events === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Route planner</p>
          <h1 className="display-title mt-2">Suggested visit order</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Stops for one vehicle on one day, ordered by a nearest-neighbor pass
            over geocoded destinations to keep total drive time low. Reorder
            stops manually when local knowledge beats the estimate.
          </p>
        </div>
        <div className="supply-row-actions">
          <BoundedDateInput
            className="input"
            aria-label="Route day"
            value={day}
            onChange={(event) => {
              setDay(event.currentTarget.value);
              setManualOrder(null);
            }}
          />
          <select
            className="input"
            aria-label="Route vehicle"
            value={vehicleId}
            onChange={(event) => {
              setVehicleId(event.currentTarget.value);
              setManualOrder(null);
            }}
          >
            {fleet.length === 0 ? <option value="">No vehicles</option> : null}
            {fleet.map((vehicle) => (
              <option key={vehicle._id} value={vehicle._id}>
                {vehicle.registration} · {vehicle.make} {vehicle.model}
              </option>
            ))}
          </select>
        </div>
      </header>
      <LogisticsWorkspaceNav />

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">
              {selectedVehicle
                ? `${selectedVehicle.registration} · ${new Date(dayStart).toLocaleDateString()}`
                : new Date(dayStart).toLocaleDateString()}
            </p>
            <h2>Stop list</h2>
          </div>
          <span>
            {stops.length} stop{stops.length === 1 ? "" : "s"}
            {totalKm > 0
              ? ` · ~${totalKm.toFixed(1)} km · ~${Math.round(totalMinutes)} min driving`
              : ""}
            {geocoding ? " · geocoding…" : ""}
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : stops.length === 0 ? (
          <div className="document-empty">
            <p>No delivery stops for this vehicle on this day.</p>
            <span>
              Runs start in{" "}
              <Link className="text-link" to="/logistics/packs">
                Pack lists
              </Link>
              : pack the event's list, schedule the run in{" "}
              <Link className="text-link" to="/logistics/deliveries">
                Deliveries
              </Link>
              , then assign this vehicle from the{" "}
              <Link className="text-link" to="/logistics/schedule">
                vehicle schedule
              </Link>
              .
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Destination</th>
                  <th>Event</th>
                  <th>Window</th>
                  <th>Leg</th>
                  <th>Reorder</th>
                </tr>
              </thead>
              <tbody>
                {orderedStops.map((stop, index) => {
                  const leg = legs[index];
                  return (
                    <tr key={stop._id}>
                      <td>{index + 1}</td>
                      <td>
                        <strong>{stop.destination}</strong>
                        {!geocoding && !coords.has(stop._id) ? (
                          <small className="block text-ink-2">
                            Address not geocoded — placed last
                          </small>
                        ) : null}
                      </td>
                      <td>{eventName(stop.eventId)}</td>
                      <td>
                        {formatTime(stop.windowStartsAt ?? dayStart)} →{" "}
                        {formatTime(stop.windowEndsAt ?? dayEnd)}
                      </td>
                      <td>
                        {leg
                          ? `${leg.distanceKm.toFixed(1)} km · ~${Math.round(leg.minutes)} min`
                          : index === 0
                            ? "Start"
                            : "—"}
                      </td>
                      <td>
                        <div className="supply-row-actions">
                          <button
                            className="btn btn-ghost"
                            type="button"
                            aria-label={`Move ${stop.destination} earlier`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            aria-label={`Move ${stop.destination} later`}
                            disabled={index === orderedStops.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {manualOrder ? (
              <p className="mt-3 text-base text-ink-2">
                Custom order.{" "}
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setManualOrder(null)}
                >
                  Reset to suggested order
                </button>
              </p>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
