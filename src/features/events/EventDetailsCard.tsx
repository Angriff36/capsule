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
import { eventClientLabel } from "./eventClientLabel";
import { EventOverviewCard } from "./EventOverviewCard";
import { eventOccasionLabel } from "./eventOccasionLabel";
import { eventServiceStyleLabel } from "./eventServiceStyleLabel";
import { eventVenueLabel } from "./eventVenueLabel";

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
  readonly clientId?: string | null;
  readonly clients: Parameters<typeof clientDisplayName>[1];
  /** Name snapshot the event stored at booking — wins over any later live catalog edit. */
  readonly clientName?: string | null;
  readonly clientsLoading?: boolean;
  readonly eventType: string;
  readonly startsAt?: number | null;
  readonly endsAt?: number | null;
  readonly expectedHeadcount?: number | null;
  readonly venue: { name: string } | null | undefined;
  readonly venueId?: string | null;
  /** Name snapshot the event stored at booking — wins over any later live catalog rename. */
  readonly venueName?: string | null;
  readonly venuesLoading?: boolean;
  readonly venueAddress?: string | null;
  readonly occasionId?: Id<"occasions"> | null;
  /** Name snapshot the event stored at booking — wins over any later live catalog rename. */
  readonly occasionName?: string | null;
  readonly occasionsLoading?: boolean;
  readonly serviceStyleId?: Id<"serviceStyles"> | null;
  /** Name snapshot the event stored at booking — wins over any later live catalog rename. */
  readonly serviceStyleName?: string | null;
  readonly serviceStylesLoading?: boolean;
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
  clientName,
  clientsLoading = false,
  eventType,
  startsAt,
  endsAt,
  expectedHeadcount,
  venue,
  venueId,
  venueName,
  venuesLoading = false,
  venueAddress,
  occasionId,
  occasionName,
  occasionsLoading = false,
  serviceStyleId,
  serviceStyleName,
  serviceStylesLoading = false,
  referralSourceId,
  primaryContactName,
  primaryContactEmail,
  accessibilityNeeds,
  editHref,
}: EventDetailsCardProps) {
  const occasionRow = (useListOccasion() ?? []).find(
    (row) => row._id === occasionId,
  );
  const occasion = eventOccasionLabel({
    occasionId,
    occasionName,
    occasion: occasionRow,
    occasionsLoading,
  });
  const serviceStyleRow = (useListServiceStyle() ?? []).find(
    (row) => row._id === serviceStyleId,
  );
  const serviceStyle = eventServiceStyleLabel({
    serviceStyleId,
    serviceStyleName,
    serviceStyle: serviceStyleRow,
    serviceStylesLoading,
  });
  const referralSource = nameOf(useListReferralSource(), referralSourceId);
  const needs = (accessibilityNeeds ?? []).filter(Boolean);
  const contact = [primaryContactName, primaryContactEmail]
    .filter(Boolean)
    .join(" · ");
  const venueLine = [
    eventVenueLabel({ venueId, venueName, venue, venuesLoading }),
    venueAddress,
  ]
    .filter(Boolean)
    .join(" · ");

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
          {clientId ? (
            <Link to={`/clients/${clientId}`} className="hover:underline">
              {eventClientLabel({
                clientId,
                clientName,
                liveName: clientDisplayName(clientId, clients),
                clientsLoading,
              })}
            </Link>
          ) : (
            eventClientLabel({
              clientId,
              clientName,
              liveName: clientDisplayName(clientId, clients),
              clientsLoading,
            })
          )}
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
          {expectedHeadcount == null
            ? "—"
            : `${formatCount(expectedHeadcount)} guests`}
        </Fact>
        <Fact icon={<MapPinIcon width={14} height={14} />} label="Venue">
          {venueLine}
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
