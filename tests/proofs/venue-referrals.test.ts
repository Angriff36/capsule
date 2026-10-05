import { describe, expect, it } from "vitest";
import { partnerScorecard } from "../../src/features/facilities/venuePartnership";
import {
  referralReport,
  rewardLevel,
  topReferringVenue,
} from "../../src/features/facilities/venueReferrals";

const DAY = 86_400_000;
// Local time, like the screen: 20 Nov 2026, so the quarter starts 1 Oct.
const now = new Date(2026, 10, 20, 12).getTime();
const at = (month: number, date: number) =>
  new Date(2026, month, date, 12).getTime();

const sources = [
  { _id: "s1", venueId: "v1" },
  { _id: "s2", venueId: "v2" },
  { _id: "s3", venueId: "v1", deletedAt: 1 },
];
const lead = (
  source: string,
  capturedAt: number,
  booked = false,
  value = 0,
) => ({
  referralSourceId: source,
  capturedAt,
  convertedAt: booked ? capturedAt + DAY : null,
  estimatedValue: value,
});

describe("leads a partner venue sends (playbook section 11)", () => {
  it("tallies the month, the quarter and the year with conversion and value", () => {
    const report = referralReport({
      venueId: "v1",
      sources,
      now,
      leads: [
        lead("s1", at(10, 3), true, 4000),
        lead("s1", at(10, 18), false, 2500),
        lead("s1", at(9, 5), true, 6000),
        lead("s1", at(1, 1), false, 1000),
        lead("s2", at(10, 4), true, 9000),
        lead("s3", at(10, 4), true, 9000),
        { ...lead("s1", at(10, 5)), deletedAt: 1 },
      ],
    });
    expect(report.month).toEqual({
      sent: 2,
      booked: 1,
      conversion: 0.5,
      estimatedValue: 6500,
      bookedValue: 4000,
    });
    expect(report.quarter.sent).toBe(3);
    expect(report.quarter.bookedValue).toBe(10_000);
    expect(report.year.sent).toBe(4);
    expect(report.reward).toBe("thank_you");
    expect(report.reminders).toEqual([]);
  });

  it("asks for a thank-you text the day a lead comes in, and a note every third lead", () => {
    const report = referralReport({
      venueId: "v1",
      sources,
      now,
      leads: [
        lead("s1", at(9, 1)),
        lead("s1", at(9, 9)),
        lead("s1", now - 3_600_000),
      ],
    });
    expect(report.reminders).toEqual([
      "New lead from this venue: text them a thank-you today",
      "That was lead number 3 from this venue: send a handwritten note",
    ]);
  });

  it("gives the playbook reward levels", () => {
    const quarter = (sent: number, bookedValue = 0) => ({
      sent,
      booked: 0,
      conversion: null,
      estimatedValue: 0,
      bookedValue,
    });
    expect(rewardLevel(quarter(0))).toBeNull();
    expect(rewardLevel(quarter(1))).toBe("thank_you");
    expect(rewardLevel(quarter(5))).toBe("recognition");
    expect(rewardLevel(quarter(10))).toBe("vip");
    expect(rewardLevel(quarter(2, 25_000))).toBe("vip");
  });

  it("finds the top referring partner venue of the year", () => {
    const leads = [
      lead("s1", at(3, 1)),
      lead("s2", at(4, 1)),
      lead("s2", at(5, 1)),
    ];
    expect(
      topReferringVenue({ venueIds: ["v1", "v2"], sources, leads, now }),
    ).toBe("v2");
    expect(
      topReferringVenue({ venueIds: ["v1"], sources, leads: [], now }),
    ).toBeNull();
  });
});

describe("venue scorecard sunset rule (playbook section 12)", () => {
  it("warns when booked value fell 40% or more on the 12 months before", () => {
    const event = (daysAgo: number, quotedPrice: number) => ({
      venueId: "v1",
      stage: "completed",
      startsAt: now - daysAgo * DAY,
      quotedPrice,
    });
    const card = (events: ReturnType<typeof event>[]) =>
      partnerScorecard({
        venue: { _id: "v1" },
        events,
        notes: [{ venueId: "v1", category: "check_in", postedAt: now }],
        referralSources: [],
        leads: [],
        now,
      });
    const down = card([event(30, 6000), event(400, 10_000)]);
    expect(down.revenuePriorYear).toBe(10_000);
    expect(down.warnings).toContain(
      "Booked value down 40% on the 12 months before",
    );
    expect(card([event(30, 6100), event(400, 10_000)]).warnings).toEqual([]);
    expect(card([event(30, 100)]).warnings).toEqual([]);
  });
});
