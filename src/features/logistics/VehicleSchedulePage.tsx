import { useState } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { formatCountNoun } from "../../lib/format";
import {
  useListDelivery,
  useListEvent,
  useListVehicle,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { LogisticsFailureBanner } from "./LogisticsFailureBanner";
import { LogisticsWorkspaceNav } from "./LogisticsWorkspaceNav";
import { useAssignVehicle } from "../facilities/vehicleAssignment";
import { BoundedDateInput } from "../../ui/BoundedDateInputs";
import { useActionNotice } from "../../ui/action-result";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MARKS = [0, 6, 12, 18, 24];

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
  version: number;
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
  operationalStatus: string;
  deletedAt?: number | null;
};

export function VehicleSchedulePage() {
  const vehicles = useListVehicle() as VehicleRow[] | undefined;
  const deliveries = useListDelivery() as DeliveryRow[] | undefined;
  const events = useListEvent();
  const assignVehicle = useAssignVehicle();
  const [day, setDay] = useState(() => toDateInputValue(new Date()));
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notice, setNotice } = useActionNotice();

  const dayStart = new Date(`${day}T00:00`).getTime();
  const dayEnd = dayStart + DAY_MS;

  const fleet = (vehicles ?? []).filter(
    (vehicle) =>
      vehicle.deletedAt == null && vehicle.operationalStatus !== "retired",
  );
  const dayRuns = (deliveries ?? []).filter(
    (row) =>
      row.deletedAt == null &&
      (String(row.status) === "scheduled" ||
        String(row.status) === "in_transit") &&
      row.windowStartsAt != null &&
      row.windowEndsAt != null &&
      row.windowStartsAt < dayEnd &&
      row.windowEndsAt > dayStart,
  );
  const unassignedRuns = dayRuns.filter((row) => row.vehicleId == null);
  const eventName = (id: string) =>
    events?.find((event) => event._id === id)?.title ?? "Unknown event";
  const shiftDay = (delta: number) =>
    setDay(toDateInputValue(new Date(dayStart + delta * DAY_MS)));

  const assign = (row: DeliveryRow, vehicleId: string) => {
    if (!vehicleId) return;
    setFailure(null);
    setNotice(null);
    setBusy(row._id);
    void (async () => {
      try {
        await assignVehicle({
          deliveryId: row._id as Id<"deliveries">,
          vehicleId: vehicleId as Id<"vehicles">,
          version: row.version,
        });
        setNotice(`Vehicle assigned to ${row.destination}.`);
      } catch (error) {
        setFailure(error);
      } finally {
        setBusy(null);
      }
    })();
  };

  const loading =
    vehicles === undefined || deliveries === undefined || events === undefined;

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Logistics · Vehicle schedule</p>
          <h1 className="display-title mt-2">Vehicle availability</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Day view of every fleet vehicle and its delivery windows. Open gaps
            are available; overlapping requests are rejected at assignment.
          </p>
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => shiftDay(-1)}
          >
            ← Previous
          </button>
          <BoundedDateInput
            className="input"
            aria-label="Schedule day"
            value={day}
            onChange={(event) => setDay(event.currentTarget.value)}
          />
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => shiftDay(1)}
          >
            Next →
          </button>
        </div>
      </header>
      <LogisticsWorkspaceNav />
      {failure ? <LogisticsFailureBanner error={failure} /> : null}
      {notice ? (
        <p className="mt-3 text-base text-ink-2" role="status">
          {notice}
        </p>
      ) : null}

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Day view</p>
            <h2>{new Date(dayStart).toLocaleDateString()}</h2>
          </div>
          <span>
            {formatCountNoun(fleet.length, "vehicle")} ·{" "}
            {formatCountNoun(dayRuns.length, "delivery run")}
          </span>
        </div>
        {loading ? (
          <TableSkeleton rows={4} />
        ) : fleet.length === 0 ? (
          <div className="document-empty">
            <p>No vehicles are registered.</p>
            <span>
              <Link className="text-link" to="/logistics/fleet">
                Register a vehicle
              </Link>{" "}
              to plan delivery runs against the fleet.
            </span>
          </div>
        ) : (
          <div className="mt-4">
            <div className="flex text-xs text-ink-2">
              <div className="w-44 shrink-0" />
              <div className="relative h-4 flex-1">
                {HOUR_MARKS.map((hour) => (
                  <span
                    key={hour}
                    className="absolute -translate-x-1/2"
                    style={{ left: `${(hour / 24) * 100}%` }}
                  >
                    {hour}:00
                  </span>
                ))}
              </div>
            </div>
            {fleet.map((vehicle) => {
              const runs = dayRuns
                .filter((row) => row.vehicleId === vehicle._id)
                .sort(
                  (a, b) => (a.windowStartsAt ?? 0) - (b.windowStartsAt ?? 0),
                );
              return (
                <div
                  key={vehicle._id}
                  className="flex items-center border-t border-line py-2"
                >
                  <div className="w-44 shrink-0 pr-3">
                    <strong className="block text-base">
                      {vehicle.registration}
                    </strong>
                    <small className="text-ink-2">
                      {vehicle.make} {vehicle.model} ·{" "}
                      {runs.length === 0
                        ? "available all day"
                        : `${runs.length} run${runs.length === 1 ? "" : "s"}`}
                    </small>
                  </div>
                  <div className="relative h-9 flex-1 rounded-xs bg-inset">
                    {HOUR_MARKS.slice(1, -1).map((hour) => (
                      <span
                        key={hour}
                        className="absolute inset-y-0 border-l border-line"
                        style={{ left: `${(hour / 24) * 100}%` }}
                      />
                    ))}
                    {runs.map((run) => {
                      const startsAt = Math.max(
                        run.windowStartsAt ?? dayStart,
                        dayStart,
                      );
                      const endsAt = Math.min(
                        run.windowEndsAt ?? dayEnd,
                        dayEnd,
                      );
                      const left = ((startsAt - dayStart) / DAY_MS) * 100;
                      const width = Math.max(
                        ((endsAt - startsAt) / DAY_MS) * 100,
                        2,
                      );
                      return (
                        <span
                          key={run._id}
                          className="absolute inset-y-1 overflow-hidden rounded-xs bg-accent/80 px-1.5 text-xs leading-7 whitespace-nowrap text-white"
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${run.destination} · ${formatTime(run.windowStartsAt ?? startsAt)} → ${formatTime(run.windowEndsAt ?? endsAt)}`}
                        >
                          {formatTime(run.windowStartsAt ?? startsAt)}{" "}
                          {run.destination}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="working-ledger">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Dispatch queue</p>
            <h2>Runs without a vehicle</h2>
          </div>
          <span>{unassignedRuns.length} waiting</span>
        </div>
        {loading ? (
          <TableSkeleton rows={2} />
        ) : unassignedRuns.length === 0 ? (
          dayRuns.length === 0 ? (
            <div className="document-empty">
              <p>No delivery runs scheduled this day.</p>
              <span>
                Runs start in{" "}
                <Link className="text-link" to="/logistics/packs">
                  Pack lists
                </Link>
                : pack the event's list, then schedule the run in{" "}
                <Link className="text-link" to="/logistics/deliveries">
                  Deliveries
                </Link>{" "}
                and it will show up here for a vehicle.
              </span>
            </div>
          ) : (
            <div className="document-empty">
              <p>Every delivery this day has a vehicle.</p>
              <span>
                Schedule more runs from{" "}
                <Link className="text-link" to="/logistics/deliveries">
                  Deliveries
                </Link>
                .
              </span>
            </div>
          )
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Destination</th>
                  <th>Event</th>
                  <th>Window</th>
                  <th>State</th>
                  <th>Assign vehicle</th>
                </tr>
              </thead>
              <tbody>
                {unassignedRuns.map((row) => (
                  <tr key={row._id}>
                    <td>
                      <strong>{row.destination}</strong>
                    </td>
                    <td>{eventName(row.eventId)}</td>
                    <td>
                      {formatTime(row.windowStartsAt ?? dayStart)} →{" "}
                      {formatTime(row.windowEndsAt ?? dayEnd)}
                    </td>
                    <td>
                      <StatusChip status={String(row.status)} />
                    </td>
                    <td>
                      <select
                        className="input"
                        aria-label={`Vehicle for ${row.destination}`}
                        value=""
                        disabled={busy != null}
                        onChange={(event) =>
                          assign(row, event.currentTarget.value)
                        }
                      >
                        <option value="">
                          {busy === row._id ? "Assigning…" : "Select vehicle"}
                        </option>
                        {fleet.map((vehicle) => (
                          <option key={vehicle._id} value={vehicle._id}>
                            {vehicle.registration} · {vehicle.make}{" "}
                            {vehicle.model}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
