import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Id } from "../../lib/api";
import { formatCount, formatDate, formatTime } from "../../lib/format";
import { formatStatusLabel } from "../../lib/statusLabels";
import {
  useListOccasion,
  useListReferralSource,
  useListServiceStyle,
} from "../../lib/manifest-convex-react";
import { CalendarIcon, UsersIcon } from "../../ui/icons";
import { clientDisplayName } from "./clientName";
import {
  AccessibilityIcon,
  BranchIcon,
  ListIcon,
  MapPinIcon,
  PencilIcon,
  PhoneIcon,
  StarIcon,
  TagIcon,
  UserIcon,
} from "./eventDetailIcons";
import { EventOverviewCard } from "./EventOverviewCard";

type Named = { _id: string; name: string };

function nameOf(
  rows: readonly Named[] | undefined,
  id: string | null | undefined,
): string | null {
  if (!id) return null;
  return rows?.find((row) => row._id === id)?.name ?? null;
}

function Fact({
  icon,
  label,
  children,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="event-fact">
      {icon}
      <div className="min-w-0">
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

export type EventDetailsCardProps = {
  readonly clientId: string;
  readonly clients: Parameters<typeof clientDisplayName>[1];
  readonly eventType: string;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly expectedHeadcount?: number | null;
  readonly venue: { name: string } | null | undefined;
  readonly venueAddress?: string | null;
  readonly occasionId?: Id<"occasions"> | null;
  readonly serviceStyleId?: Id<"serviceStyles"> | null;
  readonly referralSourceId?: Id<"referralSources"> | null;
  readonly primaryContactName?: string | null;
  readonly primaryContactEmail?: string | null;
  readonly accessibilityNeeds?: string[] | null;
  /** Anchor to the edit forms further down the tab. */
  readonly editHref: string;
};

/** The standing facts of the event, read-first, with one way in to edit them. */
export function EventDetailsCard({
  clientId,
  clients,
  eventType,
  startsAt,
  endsAt,
  expectedHeadcount,
  venue,
  venueAddress,
  occasionId,
  serviceStyleId,
  referralSourceId,
  primaryContactName,
  primaryContactEmail,
  accessibilityNeeds,
  editHref,
}: EventDetailsCardProps) {
  const occasion = nameOf(useListOccasion(), occasionId);
  const serviceStyle = nameOf(useListServiceStyle(), serviceStyleId);
  const referralSource = nameOf(useListReferralSource(), referralSourceId);
  const needs = (accessibilityNeeds ?? []).filter(Boolean);
  const contact = [primaryContactName, primaryContactEmail]
    .filter(Boolean)
    .join(" · ");
  const venueLine = [venue?.name, venueAddress].filter(Boolean).join(" · ");

  return (
    <EventOverviewCard
      title="Event details"
      testId="event-details-card"
      aside={
        <a
          href={editHref}
          className="inline-flex items-center gap-1.5 text-base font-medium text-link"
        >
          <PencilIcon width={14} height={14} />
          Edit
        </a>
      }
    >
      <dl className="event-fact-grid">
        <Fact icon={<UserIcon width={14} height={14} />} label="Client">
          <Link to={`/clients/${clientId}`} className="hover:underline">
            {clientDisplayName(clientId, clients)}
          </Link>
        </Fact>
        <Fact icon={<TagIcon width={14} height={14} />} label="Event type">
          {formatStatusLabel(eventType)}
        </Fact>
        <Fact icon={<CalendarIcon width={14} height={14} />} label="Date">
          {formatDate(startsAt)}
          {startsAt != null
            ? ` · ${formatTime(startsAt)} – ${formatTime(endsAt)}`
            : ""}
        </Fact>
        <Fact icon={<UsersIcon width={14} height={14} />} label="Headcount">
          {formatCount(expectedHeadcount)} guests
        </Fact>
        <Fact icon={<MapPinIcon width={14} height={14} />} label="Venue">
          {venueLine || "No venue yet"}
        </Fact>
        {occasion ? (
          <Fact icon={<StarIcon width={14} height={14} />} label="Occasion">
            {occasion}
          </Fact>
        ) : null}
        {serviceStyle ? (
          <Fact
            icon={<ListIcon width={14} height={14} />}
            label="Service style"
          >
            {serviceStyle}
          </Fact>
        ) : null}
        {contact ? (
          <Fact
            icon={<PhoneIcon width={14} height={14} />}
            label="Primary contact"
          >
            {contact}
          </Fact>
        ) : null}
        {referralSource ? (
          <Fact
            icon={<BranchIcon width={14} height={14} />}
            label="Referral source"
          >
            {referralSource}
          </Fact>
        ) : null}
        {needs.length > 0 ? (
          <Fact
            icon={<AccessibilityIcon width={14} height={14} />}
            label="Accessibility needs"
          >
            {needs.join(", ")}
          </Fact>
        ) : null}
      </dl>
    </EventOverviewCard>
  );
}
