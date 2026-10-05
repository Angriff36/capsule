import { Link } from "react-router-dom";
import {
  availabilitySummary,
  replacementsFor,
  type ItemAvailability,
} from "./equipmentAvailabilityView";

const when = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Under the equipment picker: how many of the chosen item are free for this
 * event's time, which events hold the rest (and when), where it is kept and
 * its condition. When it is short or out of service it offers the ways out:
 * another item of the same kind, moving one from another place, or renting.
 */
export function EventEquipmentAvailabilityNote({
  item,
  all,
  wanted,
  onPick,
}: {
  readonly item: ItemAvailability;
  readonly all: readonly ItemAvailability[];
  readonly wanted: number;
  readonly onPick: (equipmentId: string) => void;
}) {
  const short = item.blocked != null || item.free < Math.max(1, wanted);
  const replacements = short ? replacementsFor(item, all, wanted) : [];
  return (
    <div
      className="field-hint space-y-1"
      data-testid="equipment-availability-note"
    >
      <p className={short ? "text-warn" : undefined}>
        {availabilitySummary(item)}
      </p>
      {item.conflicts.length > 0 ? (
        <ul className="list-disc pl-5">
          {item.conflicts.map((conflict) => (
            <li key={`${conflict.eventId}:${conflict.startsAt}`}>
              {conflict.eventTitle} · {conflict.quantity} held ·{" "}
              {conflict.overdue
                ? `still out, was due back ${when.format(conflict.endsAt)}`
                : `${when.format(conflict.startsAt)} to ${when.format(conflict.endsAt)}`}
            </li>
          ))}
        </ul>
      ) : null}
      {short ? (
        <div className="space-y-1">
          <p>Not enough for this event. You can:</p>
          <ul className="list-disc pl-5">
            {replacements.slice(0, 3).map((other) => (
              <li key={other.equipmentId}>
                <button
                  type="button"
                  className="underline font-medium"
                  onClick={() => onPick(other.equipmentId)}
                >
                  Use {other.name} instead
                </button>{" "}
                ({other.free} free
                {other.location ? `, at ${other.location}` : ""})
              </li>
            ))}
            <li>
              Move one from another place on the{" "}
              <Link
                to="/facilities/equipment"
                target="_blank"
                rel="noopener"
                className="underline font-medium"
              >
                equipment list
              </Link>
            </li>
            <li>Rent it in “Rented from vendors” below</li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
