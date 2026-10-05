import type { Doc } from "../../lib/api";
import { REWARDS, referralReport, type ReferralPeriod } from "./venueReferrals";

const money = (value: number) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const percent = (value: number | null) =>
  value == null ? "—" : `${Math.round(value * 100)}%`;

function Period({ title, period }: { title: string; period: ReferralPeriod }) {
  return (
    <div className="rounded-sm border border-line p-3">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      <p className="text-sm text-ink-2">
        {period.sent} lead{period.sent === 1 ? "" : "s"} sent, {period.booked}{" "}
        booked ({percent(period.conversion)})
      </p>
      <p className="text-sm text-ink-3">
        Estimated value {money(period.estimatedValue)}; booked{" "}
        {money(period.bookedValue)}
      </p>
    </div>
  );
}

/**
 * Leads this partner venue sends us (playbook section 11): the monthly tally
 * to share at the check-in, the quarterly report and the reward it earns.
 */
export function VenueReferralsPanel({
  venueId,
  sources,
  leads,
  isTopVenue,
}: {
  venueId: string;
  sources: Doc<"referralSources">[];
  leads: Doc<"leads">[];
  /** The partner venue that sent the most leads this year. */
  isTopVenue: boolean;
}) {
  const report = referralReport({ venueId, sources, leads, now: Date.now() });
  const reward = isTopVenue ? "elite" : report.reward;
  return (
    <div className="space-y-2" data-testid="venue-referrals">
      <h3 className="text-sm font-semibold text-ink">Leads from this venue</h3>
      <div className="grid gap-2 sm:grid-cols-3">
        <Period title="This month" period={report.month} />
        <Period title="This quarter" period={report.quarter} />
        <Period title="This year" period={report.year} />
      </div>
      {report.month.sent > 0 ? (
        <p className="text-sm text-ink-2">
          Tell them at the check-in: “You sent us {report.month.sent} lead
          {report.month.sent === 1 ? "" : "s"} this month, thank you.
          {report.month.booked > 0
            ? ` ${report.month.booked} of them booked.`
            : ""}
          ”
        </p>
      ) : null}
      {reward ? (
        <p className="text-sm text-ink-2">
          <span className="font-semibold text-ink">
            Reward: {REWARDS[reward].label}.
          </span>{" "}
          {REWARDS[reward].reward} The owner approves any spending.
        </p>
      ) : null}
      {report.reminders.length > 0 ? (
        <ul className="space-y-1 rounded-sm border border-warn/40 bg-warn-soft p-2 text-sm text-ink">
          {report.reminders.map((reminder) => (
            <li key={reminder}>{reminder}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
