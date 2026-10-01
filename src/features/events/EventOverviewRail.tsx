import { formatStatusLabel } from "../../lib/statusLabels";
import { EventOverviewCard } from "./EventOverviewCard";
import { eventOwnerLabel } from "./eventOwnerLabel";

type OwnerPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  role: string;
};

export type EventOverviewRailProps = {
  readonly assignedToId?: string | null;
  readonly ownerName?: string | null;
  readonly people: readonly OwnerPerson[] | undefined;
  readonly peopleLoading: boolean;
};

/** Who owns this event. */
export function EventOverviewRail(props: EventOverviewRailProps) {
  const owner = props.assignedToId
    ? props.people?.find((person) => person._id === props.assignedToId)
    : undefined;

  return (
    <>
      <EventOverviewCard title="Assigned owner" testId="event-assigned-owner">
        <div>
          {/* The booked owner snapshot (eventOwnerLabel) — a later catalog
              rename must not rewrite the printed name. Role stays a live
              catalog fact, so it only prints when the person row exists. */}
          <p
            className="text-base font-semibold text-ink"
            data-testid="event-assigned-owner-name"
          >
            {eventOwnerLabel({
              assignedToId: props.assignedToId,
              ownerName: props.ownerName,
              liveName: owner ? `${owner.givenName} ${owner.familyName}` : "—",
              peopleLoading: props.peopleLoading,
            })}
          </p>
          {owner ? (
            <p className="text-sm text-ink-2">
              {formatStatusLabel(owner.role)}
            </p>
          ) : null}
        </div>
      </EventOverviewCard>
    </>
  );
}
