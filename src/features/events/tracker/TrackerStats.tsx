import type { Doc } from "../../../lib/api";
import type { Booking } from "./bookingConflicts";
import { statusGroup } from "./TrackerBoardRow";
import type { TrackerRow } from "./trackerSheet";

/**
 * The tracker's numbers bar: events in the month by status, the trucks and
 * equipment out right now, and how many things are double-booked.
 */
export function TrackerStats({
  rows,
  bookings,
  vehicles,
  equipment,
  conflicts,
}: {
  rows: readonly TrackerRow[];
  bookings: readonly Booking[];
  /** Vehicles and trailers the company can use. */
  vehicles: number;
  equipment: readonly Doc<"equipments">[];
  conflicts: number;
}) {
  const live = rows.filter((row) => statusGroup(row.stage) !== "cancelled");
  const confirmed = live.filter(
    (row) => statusGroup(row.stage) === "confirmed",
  ).length;
  const pending = live.filter(
    (row) => statusGroup(row.stage) === "pending",
  ).length;
  const now = Date.now();
  const today = new Date();
  const dayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  const vehiclesToday = new Set(
    bookings
      .filter(
        (row) =>
          row.resource === "vehicle" &&
          row.start < dayEnd &&
          row.end > dayStart,
      )
      .map((row) => row.key),
  ).size;
  const unitsOut = bookings
    .filter(
      (row) =>
        row.resource === "equipment" && row.start <= now && row.end > now,
    )
    .reduce((sum, row) => sum + row.quantity, 0);
  const units = equipment.reduce((sum, row) => sum + row.quantity, 0);

  const stats = [
    { label: "Events", value: String(live.length), tone: "brand" },
    { label: "Confirmed", value: String(confirmed), tone: "" },
    { label: "Pending", value: String(pending), tone: "" },
    {
      label: "Vehicles today",
      value: `${vehiclesToday}/${vehicles}`,
      tone: "",
    },
    { label: "Equipment out now", value: `${unitsOut}/${units}`, tone: "" },
    {
      label: "Double bookings",
      value: String(conflicts),
      tone: conflicts > 0 ? "danger" : "",
    },
  ];
  return (
    <dl className="trk-stats">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="trk-stat"
          data-tone={stat.tone || undefined}
        >
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}
