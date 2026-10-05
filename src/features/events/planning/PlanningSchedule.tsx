import { useState } from "react";
import {
  eventWindow,
  isLiveEvent,
  personName,
  rigName,
  rigWindow,
  type PlanSnapshot,
  type Window,
} from "../../../lib/planningChecks";
import { DAY_MS, startOfDay } from "../../home/homeCalendar";

export type ScheduleKind = "people" | "trucks" | "trailers" | "equipment";

type Booking = { eventId: string; title: string; span: Window; note: string };
type Row = { id: string; name: string; sub: string; bookings: Booking[] };

const overlaps = (a: Window, b: Window) => a.start < b.end && b.start < a.end;

function rowsFor(snap: PlanSnapshot, kind: ScheduleKind): Row[] {
  const live = new Map(
    snap.events.filter(isLiveEvent).map((event) => [event._id, event]),
  );
  const rows = new Map<string, Row>();
  const row = (id: string, name: string, sub: string) => {
    let found = rows.get(id);
    if (!found) {
      found = { id, name, sub, bookings: [] };
      rows.set(id, found);
    }
    return found;
  };

  if (kind === "people") {
    for (const person of snap.people)
      if (person.deletedAt == null && person.status === "active")
        row(person._id, personName(person), "Staff");
    for (const entry of snap.assignments) {
      const event = live.get(entry.eventId);
      if (
        !event ||
        entry.deletedAt != null ||
        ["unassigned", "no_show"].includes(entry.status)
      )
        continue;
      const span =
        entry.startsAt != null &&
        entry.endsAt != null &&
        entry.endsAt > entry.startsAt
          ? { start: entry.startsAt, end: entry.endsAt }
          : eventWindow(event);
      const person = snap.people.find((p) => p._id === entry.personId);
      if (span)
        row(entry.personId, personName(person), "Staff").bookings.push({
          eventId: event._id,
          title: event.title,
          span,
          note: entry.role,
        });
    }
  } else if (kind === "trucks" || kind === "trailers") {
    const fleet = kind === "trucks" ? snap.vehicles : snap.trailers;
    for (const item of fleet)
      if (item.deletedAt == null && item.operationalStatus !== "retired")
        row(
          item._id,
          rigName(item, kind === "trucks" ? "Truck" : "Trailer"),
          item.operationalStatus === "available" ||
            item.operationalStatus === "in_use"
            ? ""
            : item.operationalStatus === "maintenance"
              ? "In the shop"
              : "Out of service",
        );
    for (const rig of snap.rigs) {
      const id = kind === "trucks" ? rig.vehicleId : rig.trailerId;
      const event = rig.activeEventId ? live.get(rig.activeEventId) : undefined;
      if (!id || !event || rig.deletedAt != null || !rows.has(id)) continue;
      const span = rigWindow(event, rig);
      const driver = snap.people.find((p) => p._id === rig.driverId);
      if (span)
        rows.get(id)!.bookings.push({
          eventId: event._id,
          title: event.title,
          span,
          note: rig.driverId ? `Driver: ${personName(driver)}` : "No driver",
        });
    }
  } else {
    for (const hold of snap.reservations) {
      const event = live.get(hold.eventId);
      const item = snap.equipment.find(
        (entry) => entry._id === hold.equipmentId,
      );
      if (
        !event ||
        !item ||
        hold.deletedAt != null ||
        !["reserved", "checked_out"].includes(hold.status)
      )
        continue;
      const span =
        hold.startsAt != null && hold.endsAt != null
          ? { start: hold.startsAt, end: hold.endsAt }
          : eventWindow(event);
      if (span)
        row(item._id, item.name, `${item.quantity} owned`).bookings.push({
          eventId: event._id,
          title: event.title,
          span,
          note: `${hold.quantity} held`,
        });
    }
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Who and what is where: one row per person, truck, trailer or equipment
 * item, one column per day, with the events each one is on. A person, truck
 * or trailer on two events at the same time is marked "booked twice".
 */
export function PlanningSchedule({
  snap,
  days,
  kind,
  today,
  selectedId,
  onSelect,
}: {
  snap: PlanSnapshot;
  days: number[];
  kind: ScheduleKind;
  today: number;
  selectedId: string | null;
  onSelect: (eventId: string) => void;
}) {
  const [everyone, setEveryone] = useState(false);
  const from = days[0]!;
  const to = days[days.length - 1]! + DAY_MS;
  const rows = rowsFor(snap, kind).map((row) => ({
    ...row,
    bookings: row.bookings.filter((booking) =>
      overlaps(booking.span, { start: from, end: to }),
    ),
  }));
  const shown = everyone ? rows : rows.filter((row) => row.bookings.length > 0);
  const countsTwice = kind !== "equipment";

  return (
    <div>
      <label className="flex items-center gap-2 py-2 text-base">
        <input
          type="checkbox"
          className="size-5"
          checked={everyone}
          onChange={(event) => setEveryone(event.target.checked)}
        />
        Show the ones with nothing booked too
      </label>
      {shown.length === 0 ? (
        <p className="py-3 text-base text-ink-2">
          Nothing is booked in these days.
        </p>
      ) : (
        <div className="plan-scroll">
          <table className="plan-schedule">
            <thead>
              <tr>
                <th scope="col">
                  {kind === "people"
                    ? "Person"
                    : kind === "trucks"
                      ? "Truck"
                      : kind === "trailers"
                        ? "Trailer"
                        : "Equipment"}
                </th>
                {days.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    data-today={day === today || undefined}
                  >
                    {new Date(day).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.name}
                    {row.sub ? <small>{row.sub}</small> : null}
                  </th>
                  {days.map((day) => {
                    const onDay = row.bookings.filter(
                      (booking) =>
                        startOfDay(booking.span.start) <= day &&
                        day <= startOfDay(booking.span.end - 1),
                    );
                    const twice =
                      countsTwice &&
                      onDay.some((a, index) =>
                        onDay.some(
                          (b, other) =>
                            other > index &&
                            a.eventId !== b.eventId &&
                            overlaps(a.span, b.span),
                        ),
                      );
                    return (
                      <td key={day} data-twice={twice || undefined}>
                        {onDay.map((booking) => (
                          <button
                            key={`${booking.eventId}:${booking.note}`}
                            type="button"
                            className="plan-schedule-cell"
                            data-selected={
                              booking.eventId === selectedId || undefined
                            }
                            onClick={() => onSelect(booking.eventId)}
                          >
                            <strong>{booking.title}</strong>
                            <span>{booking.note}</span>
                          </button>
                        ))}
                        {twice ? (
                          <span className="plan-schedule-twice">
                            Booked twice
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
