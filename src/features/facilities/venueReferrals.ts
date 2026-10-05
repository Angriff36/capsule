// Leads a partner venue sends us (Mangia Venue Partner Playbook section 11):
// the monthly tally for the check-in, the quarterly referral report, the
// reward level the playbook gives for it, and the thank-yous it asks for.
// Leads count when their lead source is linked to the venue.

const DAY = 86_400_000;

export interface ReferralSourceRow {
  _id: string;
  venueId?: string | null;
  deletedAt?: number | null;
}

export interface ReferralLeadRow {
  referralSourceId?: string | null;
  capturedAt?: number | null;
  convertedAt?: number | null;
  estimatedValue?: number | null;
  deletedAt?: number | null;
}

export type RewardLevel = "thank_you" | "recognition" | "vip" | null;

export const REWARDS: Record<
  Exclude<RewardLevel, null> | "elite",
  { label: string; reward: string }
> = {
  thank_you: {
    label: "Thank you",
    reward:
      "A personal thank-you text within 24 hours of each lead; a handwritten note after every third.",
  },
  recognition: {
    label: "Recognition (5+ leads this quarter)",
    reward:
      "Feature them in a Partner Spotlight post; bring coffee or lunch to the next meeting.",
  },
  vip: {
    label: "VIP (10+ leads or $25,000+ booked this quarter)",
    reward:
      "Dinner for two; priority dates for their events; first look at new menu items.",
  },
  elite: {
    label: "Elite partner (top referring venue this year)",
    reward:
      "A yearly thank-you gift; shared marketing; featured in all our materials.",
  },
};

export interface ReferralPeriod {
  sent: number;
  booked: number;
  /** Booked share, 0-1; null with no leads. */
  conversion: number | null;
  /** Estimated value of all leads sent. */
  estimatedValue: number;
  /** Estimated value of the leads that booked. */
  bookedValue: number;
}

export interface ReferralReport {
  month: ReferralPeriod;
  quarter: ReferralPeriod;
  year: ReferralPeriod;
  reward: RewardLevel;
  /** Plain to-dos: thank-you text, handwritten note. */
  reminders: string[];
}

const periodStart = (now: number, kind: "month" | "quarter" | "year") => {
  const date = new Date(now);
  const month =
    kind === "month"
      ? date.getMonth()
      : kind === "quarter"
        ? date.getMonth() - (date.getMonth() % 3)
        : 0;
  return new Date(date.getFullYear(), month, 1).getTime();
};

/** The leads sent by this venue (through any lead source linked to it). */
export function venueLeads(input: {
  venueId: string;
  sources: readonly ReferralSourceRow[];
  leads: readonly ReferralLeadRow[];
}): ReferralLeadRow[] {
  const ids = new Set(
    input.sources
      .filter(
        (source) =>
          source.deletedAt == null &&
          String(source.venueId ?? "") === input.venueId,
      )
      .map((source) => String(source._id)),
  );
  return input.leads.filter(
    (lead) =>
      lead.deletedAt == null &&
      lead.referralSourceId != null &&
      ids.has(String(lead.referralSourceId)),
  );
}

function period(
  leads: readonly ReferralLeadRow[],
  from: number,
  now: number,
): ReferralPeriod {
  const inside = leads.filter(
    (lead) =>
      lead.capturedAt != null &&
      lead.capturedAt >= from &&
      lead.capturedAt <= now,
  );
  const booked = inside.filter((lead) => lead.convertedAt != null);
  const value = (rows: readonly ReferralLeadRow[]) =>
    rows.reduce((sum, lead) => sum + (Number(lead.estimatedValue) || 0), 0);
  return {
    sent: inside.length,
    booked: booked.length,
    conversion: inside.length ? booked.length / inside.length : null,
    estimatedValue: value(inside),
    bookedValue: value(booked),
  };
}

/** The playbook reward a quarter's referrals earn. */
export function rewardLevel(quarter: ReferralPeriod): RewardLevel {
  if (quarter.sent >= 10 || quarter.bookedValue >= 25_000) return "vip";
  if (quarter.sent >= 5) return "recognition";
  if (quarter.sent >= 1) return "thank_you";
  return null;
}

export function referralReport(input: {
  venueId: string;
  sources: readonly ReferralSourceRow[];
  leads: readonly ReferralLeadRow[];
  now: number;
}): ReferralReport {
  const { now } = input;
  const leads = venueLeads(input);
  const quarter = period(leads, periodStart(now, "quarter"), now);
  const dated = leads
    .filter((lead) => lead.capturedAt != null)
    .sort((a, b) => Number(a.capturedAt) - Number(b.capturedAt));
  const reminders: string[] = [];
  const newest = dated[dated.length - 1];
  if (newest && now - Number(newest.capturedAt) <= DAY)
    reminders.push("New lead from this venue: text them a thank-you today");
  if (
    newest &&
    dated.length % 3 === 0 &&
    now - Number(newest.capturedAt) <= 30 * DAY
  )
    reminders.push(
      `That was lead number ${dated.length} from this venue: send a handwritten note`,
    );
  return {
    month: period(leads, periodStart(now, "month"), now),
    quarter,
    year: period(leads, periodStart(now, "year"), now),
    reward: rewardLevel(quarter),
    reminders,
  };
}

/** The partner venue that sent the most leads this year; null when none sent any. */
export function topReferringVenue(input: {
  venueIds: readonly string[];
  sources: readonly ReferralSourceRow[];
  leads: readonly ReferralLeadRow[];
  now: number;
}): string | null {
  const from = periodStart(input.now, "year");
  let best: { id: string; sent: number } | null = null;
  for (const venueId of input.venueIds) {
    const sent = period(
      venueLeads({ ...input, venueId }),
      from,
      input.now,
    ).sent;
    if (sent > 0 && (best == null || sent > best.sent))
      best = { id: venueId, sent };
  }
  return best?.id ?? null;
}
