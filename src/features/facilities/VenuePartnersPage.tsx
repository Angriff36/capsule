import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useListLead,
  useListPerson,
  useListReferralSource,
  useListVenue,
  useListVenueNote,
} from "../../lib/manifest-convex-react";
import { formatDate } from "../../lib/format";
import { FacilitiesWorkspaceNav } from "./FacilitiesWorkspaceNav";
import { venueDetailPath } from "./facilitiesRoutes";
import { useVenueScorecardEvents } from "./useLogisticsWindow";
import { handoffStatus, ownerProblem } from "./venueHandoff";
import { problemStatus } from "./venueEscalation";
import { onboardingStatus } from "./venueOnboarding";
import { REWARDS, referralReport, topReferringVenue } from "./venueReferrals";
import {
  CONTACT_DAYS,
  PARTNER_TIER_LABELS,
  partnerScorecard,
  type PartnerTier,
} from "./venuePartnership";

const money = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

/**
 * Every partner venue with its owner, last check-in and scorecard, venues
 * that need a call first (Mangia Venue Partner Playbook sections 02-05, 12).
 */
export function VenuePartnersPage() {
  const venues = useListVenue();
  const people = useListPerson();
  const notes = useListVenueNote();
  const sources = useListReferralSource();
  const leads = useListLead();
  // The partner venues' events of the last two years only.
  const partnerIds = useMemo(
    () =>
      venues
        ?.filter((venue) => venue.deletedAt == null && venue.partnerTier)
        .map((venue) => String(venue._id)),
    [venues],
  );
  const events = useVenueScorecardEvents(partnerIds);

  const rows = useMemo(() => {
    const now = Date.now();
    const activeStaffIds = new Set(
      (people ?? [])
        .filter((person) => person.deletedAt == null)
        .map((person) => String(person._id)),
    );
    const partners = (venues ?? []).filter(
      (venue) => venue.deletedAt == null && venue.partnerTier,
    );
    const topVenueId = topReferringVenue({
      venueIds: partners.map((venue) => String(venue._id)),
      sources: sources ?? [],
      leads: leads ?? [],
      now,
    });
    return partners
      .map((venue) => {
        const owner = (people ?? []).find(
          (person) =>
            String(person._id) === String(venue.partnerOwnerPersonId ?? ""),
        );
        const card = partnerScorecard({
          venue,
          events: events ?? [],
          notes: notes ?? [],
          referralSources: sources ?? [],
          leads: leads ?? [],
          now,
        });
        const ownerWarning = ownerProblem({
          isPartner: true,
          ownerId: venue.partnerOwnerPersonId,
          activeStaffIds,
          staffLoaded: people !== undefined,
        });
        const handoff = handoffStatus({
          venueId: String(venue._id),
          notes: notes ?? [],
          now,
        });
        // Only late start-up steps show here; venue-only dishes are not read.
        const onboarding = onboardingStatus({
          venue,
          notes: notes ?? [],
          events: events ?? [],
          venueOnlyDishCount: null,
          now,
          formatDate,
        });
        const referrals = referralReport({
          venueId: String(venue._id),
          sources: sources ?? [],
          leads: leads ?? [],
          now,
        });
        return {
          venue,
          reward:
            String(venue._id) === topVenueId
              ? ("elite" as const)
              : referrals.reward,
          ownerName: owner
            ? [owner.givenName, owner.familyName].filter(Boolean).join(" ")
            : null,
          card,
          warnings: [
            ...(ownerWarning ? [ownerWarning] : []),
            ...(handoff?.reminders ?? []),
            ...(onboarding?.reminders ?? []),
            ...referrals.reminders,
            ...problemStatus({
              venueId: String(venue._id),
              notes: notes ?? [],
              contacts: notes ?? [],
              now,
              formatDate,
            }).reminders,
            ...card.warnings,
          ],
        };
      })
      .sort(
        (a, b) =>
          Number(b.card.contactOverdue) - Number(a.card.contactOverdue) ||
          a.venue.name.localeCompare(b.venue.name),
      );
  }, [venues, people, notes, sources, leads, events]);

  const loading = venues === undefined || events === undefined;
  const overdue = rows.filter((row) => row.card.contactOverdue).length;

  return (
    <div className="space-y-4">
      <FacilitiesWorkspaceNav />
      <header>
        <h1 className="text-xl font-bold">Venue partners</h1>
        <p className="text-sm text-ink-3">
          Each partner venue has one owner who checks in at least every{" "}
          {CONTACT_DAYS} days. Venues that need a call are at the top.
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-ink-3">Loading partner venues…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-3">
          No partner venues yet. Open a venue and pick a partnership tier under
          “Venue partner”.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink">
            {rows.length} partner venue{rows.length === 1 ? "" : "s"}
            {overdue > 0 ? ` · ${overdue} need a check-in` : ""}
          </p>
          <ul className="space-y-3">
            {rows.map(({ venue, ownerName, card, warnings, reward }) => (
              <li
                key={venue._id}
                className={`rounded-sm border bg-panel p-4 ${card.contactOverdue ? "border-warn" : "border-line"}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    to={venueDetailPath(venue._id)}
                    className="text-base font-semibold text-brand hover:underline"
                  >
                    {venue.name}
                  </Link>
                  <span className="text-sm font-semibold text-ink">
                    {card.grade ? `Grade ${card.grade}` : "Not rated"}
                  </span>
                </div>
                <p className="text-sm text-ink-3">
                  {PARTNER_TIER_LABELS[venue.partnerTier as PartnerTier]} ·{" "}
                  {ownerName ?? "No owner yet"}
                  {reward ? ` · Reward: ${REWARDS[reward].label}` : ""}
                </p>
                <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-ink-3">Last check-in</dt>
                    <dd
                      className={
                        card.contactOverdue ? "font-semibold text-warn" : ""
                      }
                    >
                      {card.lastContactAt == null
                        ? "Never"
                        : `${formatDate(card.lastContactAt)} (${card.daysSinceContact} days)`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Events, 12 months</dt>
                    <dd>{card.eventsLastYear}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Booked value, 12 months</dt>
                    <dd>{money(card.revenueLastYear)}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-3">Leads sent (booked)</dt>
                    <dd>
                      {card.referralsSent} ({card.referralsBooked})
                    </dd>
                  </div>
                </dl>
                {warnings.length > 0 ? (
                  <p className="mt-2 text-sm text-warn">
                    {warnings.join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
