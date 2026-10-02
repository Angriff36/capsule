/**
 * Revenue and splits for a period (PL-ATTRIBUTION, spec §7.3 / §8.5,
 * AC-302 / AC-322). Pure: the page passes the live lists in.
 *
 * - gross: booked (quoted) revenue of the period's events, cancelled ones out;
 * - venueProduced: gross of the events that carry a venue commission split;
 * - splits: what agreed splits hand out - an applied split's booked amount,
 *   an approved one's amount worked out the same way apply works it out;
 * - venueCommission: the venue commission part of splits;
 * - retained: gross less splits;
 * - unsplit: gross of the events with no split at all (nobody mapped them);
 * - waiting: splits not agreed yet (draft or waiting for approval), counted
 *   apart so they never inflate splits.
 * A rejected or removed split counts nowhere.
 */

export type SplitEvent = {
  readonly _id: string;
  readonly stage: string;
  readonly startsAt?: number | null;
  readonly quotedPrice?: number | null;
  readonly deletedAt?: number | null;
};

export type SplitRow = {
  readonly eventId: string;
  readonly attributionType: string;
  readonly allocationMethod: string;
  readonly status: string;
  readonly percentBasis?: number | null;
  readonly fixedAmount?: number | null;
  readonly allocatedAmount?: number | null;
  readonly deletedAt?: number | null;
};

export type RevenueSplitMeasures = {
  readonly gross: number;
  readonly venueProduced: number;
  readonly splits: number;
  readonly venueCommission: number;
  readonly retained: number;
  readonly unsplit: number;
  readonly waiting: number;
  readonly eventCount: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

function splitAmount(row: SplitRow, revenue: number): number {
  if (row.status === "applied") return Number(row.allocatedAmount ?? 0);
  return row.allocationMethod === "percent"
    ? round2((revenue * Number(row.percentBasis ?? 0)) / 100)
    : Number(row.fixedAmount ?? 0);
}

export function revenueSplitMeasures(
  events: readonly SplitEvent[],
  splits: readonly SplitRow[],
  periodStart: number,
  periodEnd: number,
): RevenueSplitMeasures {
  const inPeriod = events.filter(
    (event) =>
      event.deletedAt == null &&
      event.stage !== "cancelled" &&
      event.startsAt != null &&
      event.startsAt >= periodStart &&
      event.startsAt < periodEnd,
  );
  const liveSplits = splits.filter(
    (row) => row.deletedAt == null && row.status !== "rejected",
  );
  let gross = 0;
  let venueProduced = 0;
  let splitTotal = 0;
  let venueCommission = 0;
  let unsplit = 0;
  let waiting = 0;
  for (const event of inPeriod) {
    const revenue = Number(event.quotedPrice ?? 0);
    gross += revenue;
    const mine = liveSplits.filter((row) => row.eventId === event._id);
    if (mine.length === 0) unsplit += revenue;
    if (mine.some((row) => row.attributionType === "venue_commission"))
      venueProduced += revenue;
    for (const row of mine) {
      const amount = splitAmount(row, revenue);
      if (row.status === "applied" || row.status === "approved") {
        splitTotal += amount;
        if (row.attributionType === "venue_commission")
          venueCommission += amount;
      } else {
        waiting += amount;
      }
    }
  }
  return {
    gross: round2(gross),
    venueProduced: round2(venueProduced),
    splits: round2(splitTotal),
    venueCommission: round2(venueCommission),
    retained: round2(gross - splitTotal),
    unsplit: round2(unsplit),
    waiting: round2(waiting),
    eventCount: inPeriod.length,
  };
}
