import { describe, expect, it } from "vitest";
import {
  partnerGrade,
  partnerScorecard,
} from "../../src/features/facilities/venuePartnership";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 5);

describe("venue partner scorecard", () => {
  it("flags a venue with no check-in for more than 14 days and counts its year", () => {
    const card = partnerScorecard({
      venue: { _id: "v1", opsEaseScore: 7, relationshipScore: 6 },
      events: [
        {
          venueId: "v1",
          stage: "completed",
          startsAt: now - 30 * DAY,
          quotedPrice: 12000,
        },
        {
          venueId: "v1",
          stage: "cancelled",
          startsAt: now - 20 * DAY,
          quotedPrice: 9000,
        },
        {
          venueId: "v1",
          stage: "completed",
          startsAt: now - 400 * DAY,
          quotedPrice: 5000,
        },
        {
          venueId: "v2",
          stage: "completed",
          startsAt: now - 10 * DAY,
          quotedPrice: 7000,
        },
      ],
      notes: [
        { venueId: "v1", category: "check_in", postedAt: now - 20 * DAY },
        { venueId: "v1", category: "other", postedAt: now - 1 * DAY },
      ],
      referralSources: [],
      leads: [],
      now,
    });
    expect(card.daysSinceContact).toBe(20);
    expect(card.contactOverdue).toBe(true);
    expect(card.warnings).toContain("No check-in for 20 days");
    expect(card.eventsLastYear).toBe(1);
    expect(card.revenueLastYear).toBe(12000);
    expect(card.referralConversion).toBeNull();
    expect(card.grade).toBe("B");
  });

  it("warns on three problems in 90 days and on six months without leads", () => {
    const card = partnerScorecard({
      venue: { _id: "v1", partnerSince: now - 300 * DAY },
      events: [],
      notes: [1, 2, 3].map((n) => ({
        venueId: "v1",
        category: "incident",
        postedAt: now - n * DAY,
      })),
      referralSources: [{ _id: "s1", venueId: "v1" }],
      leads: [{ referralSourceId: "s1", capturedAt: now - 200 * DAY }],
      now,
    });
    expect(card.warnings).toEqual([
      "No check-in logged yet",
      "3 problems in the last 90 days",
      "No leads from this venue in 6 months",
    ]);
    expect(card.grade).toBeNull();
  });

  it("grades A-D from the two ratings and the year's work", () => {
    const base = { eventsLastYear: 6, referralsSent: 0 };
    expect(
      partnerGrade({ ...base, opsEaseScore: 9, relationshipScore: 8 }),
    ).toBe("A");
    expect(
      partnerGrade({ ...base, opsEaseScore: 9, relationshipScore: 6 }),
    ).toBe("B");
    expect(
      partnerGrade({ ...base, opsEaseScore: 5, relationshipScore: 9 }),
    ).toBe("C");
    expect(
      partnerGrade({ ...base, opsEaseScore: 4, relationshipScore: 9 }),
    ).toBe("D");
    expect(
      partnerGrade({
        opsEaseScore: 9,
        relationshipScore: 9,
        eventsLastYear: 0,
        referralsSent: 0,
      }),
    ).toBe("D");
    expect(
      partnerGrade({ ...base, opsEaseScore: null, relationshipScore: 9 }),
    ).toBeNull();
  });
});
