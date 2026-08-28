import { Link } from "react-router-dom";
import { formatCount, formatDate } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import { CheckCircleIcon, ClockIcon, UsersIcon } from "../../ui/icons";
import { HardHatIcon, RepeatIcon } from "./eventDetailIcons";
import { EventOverviewCard } from "./EventOverviewCard";

type OwnerPerson = {
  _id: string;
  givenName: string;
  familyName: string;
  role: string;
};

export type EventOverviewRailProps = {
  readonly assignedToId?: string | null;
  readonly people: readonly OwnerPerson[] | undefined;
  readonly dishCount: number;
  readonly staffCount: number;
  readonly timelineCount: number;
  readonly recurrenceFrequency?: string | null;
  readonly recurrenceNextStartsAt?: number | null;
  readonly recurrenceGeneratedCount?: number | null;
  readonly recurrenceActive?: boolean | null;
  readonly operationalRequirements?: string | null;
  readonly menuHref: string;
  readonly staffingHref: string;
  readonly timelineHref: string;
  readonly recurringHref: string;
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

/** Ownership, counts, recurrence, and standing instructions for this event. */
export function EventOverviewRail(props: EventOverviewRailProps) {
  const owner = props.assignedToId
    ? props.people?.find((person) => person._id === props.assignedToId)
    : undefined;
  const frequency = props.recurrenceFrequency
    ? formatStatusLabel(props.recurrenceFrequency)
    : null;
  const seriesCount = Number(props.recurrenceGeneratedCount ?? 0);

  return (
    <>
      <EventOverviewCard title="Assigned owner" testId="event-assigned-owner">
        {owner ? (
          <div>
            <p className="text-base font-semibold text-ink">
              {owner.givenName} {owner.familyName}
            </p>
            <p className="text-sm text-ink-2">
              {formatStatusLabel(owner.role)}
            </p>
          </div>
        ) : (
          <p className="text-base text-ink-2">
            No owner assigned to this event.
          </p>
        )}
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
          <StatRow
            icon={<UsersIcon width={14} height={14} />}
            label="Recurrence occurrences"
            value={formatCount(seriesCount)}
            to={props.recurringHref}
          />
        </ul>
      </EventOverviewCard>

      <EventOverviewCard
        title="Recurring schedule"
        testId="event-recurring-summary"
        aside={<RepeatIcon width={15} height={15} />}
      >
        {frequency ? (
          <>
            <p className="text-base text-ink">
              {frequency}
              {props.recurrenceNextStartsAt != null
                ? ` · next ${formatDate(props.recurrenceNextStartsAt)}`
                : ""}
            </p>
            <p className="mt-1 text-sm text-ink-2">
              {props.recurrenceActive === false
                ? "Recurrence stopped."
                : `${formatCount(seriesCount)} occurrence(s) generated.`}
            </p>
          </>
        ) : (
          <p className="text-base text-ink-2">This event does not repeat.</p>
        )}
        <Link
          to={props.recurringHref}
          className="mt-2 inline-block text-base font-medium text-link hover:underline"
        >
          {frequency ? "Manage schedule" : "Set up a schedule"}
        </Link>
      </EventOverviewCard>

      <EventOverviewCard
        title="Operational requirements"
        testId="event-operational-requirements"
      >
        <p className="text-base leading-relaxed text-ink-2">
          {props.operationalRequirements?.trim() ||
            "No operational requirements recorded."}
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
