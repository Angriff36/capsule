import { Link } from "react-router-dom";
import { formatCount } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { CheckCircleIcon, ClockIcon } from "../../ui/icons";
import { HardHatIcon } from "./eventDetailIcons";
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
  readonly dishCount: number;
  readonly staffCount: number;
  readonly timelineCount: number;
  readonly operationalRequirements?: string | null;
  readonly menuHref: string;
  readonly staffingHref: string;
  readonly timelineHref: string;
  readonly editHref: string;
};

function StatRow({
  icon,
  label,
  value,
  to,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly value: string;
  readonly to: string;
}) {
  return (
    <li className="event-rail-row">
      <span className="event-rail-label">
        {icon}
        <Link to={to} className="hover:underline">
          {label}
        </Link>
      </span>
      <span className="event-rail-value">{value}</span>
    </li>
  );
}

/** Ownership, counts, and standing instructions for this event. */
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

      <EventOverviewCard title="Quick stats" testId="event-quick-stats">
        <ul className="grid gap-3">
          <StatRow
            icon={<CheckCircleIcon width={14} height={14} />}
            label="Menu dishes"
            value={formatCount(props.dishCount)}
            to={props.menuHref}
          />
          <StatRow
            icon={<HardHatIcon width={14} height={14} />}
            label="Staff assigned"
            value={formatCount(props.staffCount)}
            to={props.staffingHref}
          />
          <StatRow
            icon={<ClockIcon width={14} height={14} />}
            label="Timeline activities"
            value={formatCount(props.timelineCount)}
            to={props.timelineHref}
          />
        </ul>
      </EventOverviewCard>

      <EventOverviewCard
        title="Operational requirements"
        testId="event-operational-requirements"
      >
        <p className="text-base leading-relaxed text-ink-2">
          {props.operationalRequirements?.trim() ||
            "No operational requirements on file."}
        </p>
        <a
          href={props.editHref}
          className="mt-2 inline-block text-base font-medium text-link"
        >
          Edit requirements
        </a>
      </EventOverviewCard>
    </>
  );
}
