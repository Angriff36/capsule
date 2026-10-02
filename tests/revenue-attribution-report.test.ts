/**
 * AC-302 (CF-7.3-03) and AC-322 (CF-8.5-03): the revenue splits page shows,
 * for a month, booked revenue, venue-produced revenue, splits (with the venue
 * commission part), revenue kept and revenue not split - plus splits still
 * waiting for approval, counted apart.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RevenueSplitSummary } from "../src/features/finance/RevenueSplitSummary";
import {
  revenueSplitMeasures,
  type SplitEvent,
  type SplitRow,
} from "../src/features/finance/revenueSplitMeasures";

const MAY = new Date(2026, 4, 1).getTime();
const JUNE = new Date(2026, 5, 1).getTime();
const day = (n: number) => new Date(2026, 4, n).getTime();

const EVENTS: SplitEvent[] = [
  { _id: "gala", stage: "approved", startsAt: day(3), quotedPrice: 20000 },
  { _id: "lunch", stage: "approved", startsAt: day(9), quotedPrice: 5000 },
  { _id: "wedding", stage: "final", startsAt: day(20), quotedPrice: 10000 },
  {
    _id: "cancelled",
    stage: "cancelled",
    startsAt: day(21),
    quotedPrice: 9999,
  },
  { _id: "june", stage: "approved", startsAt: JUNE + 1, quotedPrice: 7777 },
];

const SPLITS: SplitRow[] = [
  // Gala: venue commission applied at 10% = 2,000; referral approved 500.
  {
    eventId: "gala",
    attributionType: "venue_commission",
    allocationMethod: "percent",
    status: "applied",
    percentBasis: 10,
    allocatedAmount: 2000,
  },
  {
    eventId: "gala",
    attributionType: "referral_fee",
    allocationMethod: "fixed",
    status: "approved",
    fixedAmount: 500,
  },
  // Wedding: venue commission approved at 12% (not applied yet) = 1,200.
  {
    eventId: "wedding",
    attributionType: "venue_commission",
    allocationMethod: "percent",
    status: "approved",
    percentBasis: 12,
  },
  // Wedding: a draft sales split waits; a rejected one counts nowhere.
  {
    eventId: "wedding",
    attributionType: "sales_commission",
    allocationMethod: "percent",
    status: "draft",
    percentBasis: 3,
  },
  {
    eventId: "lunch",
    attributionType: "partner_split",
    allocationMethod: "fixed",
    status: "rejected",
    fixedAmount: 900,
  },
];

describe("revenue and splits report", () => {
  it("works out the five measures for a month", () => {
    expect(revenueSplitMeasures(EVENTS, SPLITS, MAY, JUNE)).toEqual({
      gross: 35000,
      venueProduced: 30000,
      splits: 3700,
      venueCommission: 3200,
      retained: 31300,
      unsplit: 5000,
      waiting: 300,
      eventCount: 3,
    });
  });

  it("shows every measure on the page", () => {
    const html = renderToStaticMarkup(
      createElement(RevenueSplitSummary, { events: EVENTS, splits: SPLITS }),
    );
    for (const label of [
      "Booked revenue",
      "Venue-produced revenue",
      "Splits handed out",
      "of which venue commission",
      "Revenue kept",
      "Not split",
      "Splits waiting for approval",
    ]) {
      expect(html).toContain(label);
    }
  });
});
