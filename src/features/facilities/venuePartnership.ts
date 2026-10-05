// Venue partner program (work/mangia-venue-partner-playbook.pdf): tiers, the
// 14-day contact rule, referral counts and the A-D scorecard grade. Pure, so
// the venue page and the partners list read the same numbers.

export const PARTNER_TIERS = [
  "catering_only",
  "catering_rentals",
  "full_event",
] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

export const PARTNER_TIER_LABELS: Record<PartnerTier, string> = {
  catering_only: "Tier 1 · Catering only",
  catering_rentals: "Tier 2 · Catering, rentals and coordination",
  full_event: "Tier 3 · Full event management",
};

/** Playbook section 03: never more than 14 days without contact. */
export const CONTACT_DAYS = 14;
const DAY = 86_400_000;
const YEAR = 365 * DAY;
const HALF_YEAR = 182 * DAY;

export interface PartnerEventRow {
  venueId?: string | null;
  stage?: string | null;
  startsAt?: number | null;
  quotedPrice?: number | null;
  deletedAt?: number | null;
}
export interface PartnerNoteRow {
  venueId: string;
  category: string;
  content?: string | null;
  rating?: number | null;
  postedAt?: number | null;
  deletedAt?: number | null;
}

/** Notes that count as contact with the venue (playbook sections 03, 13). */
const CONTACT_KINDS = new Set(["check_in", "thank_you"]);
/** After-event notes shared at the monthly check-in (playbook section 13 step 5). */
const MONTHLY_KINDS = new Set(["client_feedback", "debrief", "incident"]);
export interface PartnerReferralSourceRow {
  _id: string;
  venueId?: string | null;
  deletedAt?: number | null;
}
export interface PartnerLeadRow {
  referralSourceId?: string | null;
  capturedAt?: number | null;
  convertedAt?: number | null;
  deletedAt?: number | null;
}
export interface PartnerVenueRow {
  _id: string;
  partnerSince?: number | null;
  opsEaseScore?: number | null;
  relationshipScore?: number | null;
}

export type PartnerGrade = "A" | "B" | "C" | "D" | null;

export interface PartnerScorecard {
  lastContactAt: number | null;
  /** Whole days since the last check-in; null when there was none. */
  daysSinceContact: number | null;
  contactOverdue: boolean;
  eventsLastYear: number;
  revenueLastYear: number;
  /** Booked value of the 12 months before the last 12. */
  revenuePriorYear: number;
  averagePerEvent: number;
  referralsSent: number;
  referralsBooked: number;
  /** Share of referred leads that booked, 0-1; null with no referrals. */
  referralConversion: number | null;
  problemsLast90Days: number;
  /** Average client score (1-10) on feedback notes in the last 12 months. */
  clientSatisfaction: number | null;
  eventsLast30Days: number;
  /** Client feedback, debriefs and problems from the last 30 days, newest first. */
  lastMonth: PartnerNoteRow[];
  grade: PartnerGrade;
  /** Plain reasons the venue needs a closer look (playbook sunset criteria). */
  warnings: string[];
}

/** Everything the scorecard shows for one venue, as of `now`. */
export function partnerScorecard(input: {
  venue: PartnerVenueRow;
  events: readonly PartnerEventRow[];
  notes: readonly PartnerNoteRow[];
  referralSources: readonly PartnerReferralSourceRow[];
  leads: readonly PartnerLeadRow[];
  now: number;
}): PartnerScorecard {
  const { venue, now } = input;
  const venueId = String(venue._id);
  const mine = input.notes.filter(
    (note) => note.deletedAt == null && String(note.venueId) === venueId,
  );
  const lastContactAt = mine
    .filter((note) => CONTACT_KINDS.has(note.category) && note.postedAt != null)
    .reduce<number | null>(
      (latest, note) => Math.max(latest ?? 0, Number(note.postedAt)),
      null,
    );
  const daysSinceContact =
    lastContactAt == null ? null : Math.floor((now - lastContactAt) / DAY);
  const problemsLast90Days = mine.filter(
    (note) =>
      note.category === "incident" &&
      note.postedAt != null &&
      now - note.postedAt <= 90 * DAY,
  ).length;
  const scores = mine
    .filter(
      (note) =>
        note.category === "client_feedback" &&
        note.rating != null &&
        note.postedAt != null &&
        now - note.postedAt <= YEAR,
    )
    .map((note) => Number(note.rating));
  const lastMonth = mine
    .filter(
      (note) =>
        MONTHLY_KINDS.has(note.category) &&
        note.postedAt != null &&
        now - note.postedAt <= 30 * DAY,
    )
    .sort((a, b) => Number(b.postedAt) - Number(a.postedAt));

  const yearEvents = input.events.filter(
    (row) =>
      row.deletedAt == null &&
      String(row.venueId ?? "") === venueId &&
      row.stage !== "cancelled" &&
      typeof row.startsAt === "number" &&
      row.startsAt <= now &&
      now - row.startsAt <= YEAR,
  );
  const revenueLastYear = yearEvents.reduce(
    (sum, row) =>
      sum +
      (Number.isFinite(Number(row.quotedPrice)) ? Number(row.quotedPrice) : 0),
    0,
  );
  // The 12 months before those, for the playbook's 40% drop sunset rule.
  const revenuePriorYear = input.events
    .filter(
      (row) =>
        row.deletedAt == null &&
        String(row.venueId ?? "") === venueId &&
        row.stage !== "cancelled" &&
        typeof row.startsAt === "number" &&
        now - row.startsAt > YEAR &&
        now - row.startsAt <= 2 * YEAR,
    )
    .reduce(
      (sum, row) =>
        sum +
        (Number.isFinite(Number(row.quotedPrice))
          ? Number(row.quotedPrice)
          : 0),
      0,
    );

  const sources = new Set(
    input.referralSources
      .filter(
        (source) =>
          source.deletedAt == null && String(source.venueId ?? "") === venueId,
      )
      .map((source) => String(source._id)),
  );
  const referred = input.leads.filter(
    (lead) =>
      lead.deletedAt == null &&
      lead.referralSourceId != null &&
      sources.has(String(lead.referralSourceId)),
  );
  const referralsBooked = referred.filter(
    (lead) => lead.convertedAt != null,
  ).length;
  const lastReferralAt = referred.reduce<number | null>(
    (latest, lead) =>
      lead.capturedAt == null ? latest : Math.max(latest ?? 0, lead.capturedAt),
    null,
  );

  const warnings: string[] = [];
  if (lastContactAt == null) warnings.push("No check-in logged yet");
  else if (daysSinceContact != null && daysSinceContact > CONTACT_DAYS)
    warnings.push(`No check-in for ${daysSinceContact} days`);
  if (problemsLast90Days >= 3)
    warnings.push(`${problemsLast90Days} problems in the last 90 days`);
  // Only once the partnership is six months old, so a new partner is not flagged.
  if (
    sources.size > 0 &&
    venue.partnerSince != null &&
    now - venue.partnerSince > HALF_YEAR &&
    (lastReferralAt == null || now - lastReferralAt > HALF_YEAR)
  )
    warnings.push("No leads from this venue in 6 months");
  if (revenuePriorYear > 0 && revenueLastYear <= revenuePriorYear * 0.6)
    warnings.push(
      `Booked value down ${Math.round((1 - revenueLastYear / revenuePriorYear) * 100)}% on the 12 months before`,
    );

  return {
    lastContactAt,
    daysSinceContact,
    contactOverdue:
      lastContactAt == null || (daysSinceContact ?? 0) > CONTACT_DAYS,
    eventsLastYear: yearEvents.length,
    revenueLastYear,
    revenuePriorYear,
    averagePerEvent: yearEvents.length
      ? revenueLastYear / yearEvents.length
      : 0,
    referralsSent: referred.length,
    referralsBooked,
    referralConversion: referred.length
      ? referralsBooked / referred.length
      : null,
    problemsLast90Days,
    clientSatisfaction: scores.length
      ? Math.round(
          (scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10,
        ) / 10
      : null,
    eventsLast30Days: yearEvents.filter(
      (row) => now - Number(row.startsAt) <= 30 * DAY,
    ).length,
    lastMonth,
    grade: partnerGrade({
      opsEaseScore: venue.opsEaseScore ?? null,
      relationshipScore: venue.relationshipScore ?? null,
      eventsLastYear: yearEvents.length,
      referralsSent: referred.length,
    }),
    warnings,
  };
}

/**
 * The playbook's A-D tiers from the owner's two ratings and the year's work:
 * A = both ratings 8+ and the venue sent leads or hosted 5+ events;
 * B = both ratings 6+; D = a rating of 4 or under, or no events and no leads
 * in a year; C = the rest. No grade until both ratings are set.
 */
export function partnerGrade(input: {
  opsEaseScore: number | null;
  relationshipScore: number | null;
  eventsLastYear: number;
  referralsSent: number;
}): PartnerGrade {
  const { opsEaseScore: ops, relationshipScore: rel } = input;
  if (ops == null || rel == null) return null;
  const low = Math.min(ops, rel);
  if (low <= 4 || (input.eventsLastYear === 0 && input.referralsSent === 0))
    return "D";
  if (low >= 8 && (input.referralsSent > 0 || input.eventsLastYear >= 5))
    return "A";
  if (low >= 6) return "B";
  return "C";
}

export const GRADE_MEANING: Record<Exclude<PartnerGrade, null>, string> = {
  A: "Protect and grow. Priority partner.",
  B: "Fix the friction. Can become A.",
  C: "Keep it going, but do not over-invest. Look again each quarter.",
  D: "Candidate to end. Set an improvement date.",
};
