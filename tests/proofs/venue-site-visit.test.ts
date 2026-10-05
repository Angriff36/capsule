import { describe, expect, it } from "vitest";
import {
  shotCounts,
  shotOf,
  siteVisitDue,
  siteVisitText,
} from "../../src/features/facilities/venueSiteVisit";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 5);

describe("venue site visits (playbook section 08)", () => {
  it("writes the answered areas in checklist order, then concerns and the dish idea", () => {
    expect(
      siteVisitText({
        answers: {
          power: " 2 x 20A ",
          loadIn: "Ramp at the side door",
          bar: "",
        },
        concerns: "Gravel path to the tent",
        dishIdea: " ",
      }),
    ).toBe(
      "Load-in: Ramp at the side door\nPower: 2 x 20A\nConcerns: Gravel path to the tent",
    );
    expect(siteVisitText({ answers: {} })).toBe("");
  });

  it("sorts venue files into the photo shots by the start of their name", () => {
    expect(shotOf("Kitchen - IMG_1.jpg")).toBe("Kitchen");
    expect(shotOf("load-in path - turn 2.jpg")).toBe("Load-in path");
    expect(shotOf("Kitchen.jpg")).toBeNull();
    expect(
      shotCounts([
        { fileName: "Kitchen - a.jpg" },
        { fileName: "Kitchen - b.jpg" },
        { fileName: "Bar - a.jpg" },
        { fileName: "floor plan.pdf" },
      ]),
    ).toEqual({ Kitchen: 2, Bar: 1 });
  });

  it("asks for a first visit at a partner venue and before the first large event", () => {
    const due = siteVisitDue({
      venue: { _id: "v1", partnerTier: "catering_only" },
      events: [
        {
          venueId: "v1",
          stage: "planning",
          startsAt: now + 10 * DAY,
          expectedHeadcount: 140,
        },
        {
          venueId: "v1",
          stage: "cancelled",
          startsAt: now + 5 * DAY,
          expectedHeadcount: 300,
        },
        {
          venueId: "v2",
          stage: "planning",
          startsAt: now + 3 * DAY,
          expectedHeadcount: 200,
        },
      ],
      notes: [],
      now,
    });
    expect(due.lastVisitAt).toBeNull();
    expect(due.reasons).toHaveLength(2);
    expect(due.reasons[0]).toMatch(/No site visit yet/);
    expect(due.reasons[1]).toMatch(/First large event here \(140 guests/);
  });

  it("does not ask before a large event when a large event already happened there", () => {
    const due = siteVisitDue({
      venue: { _id: "v1" },
      events: [
        {
          venueId: "v1",
          stage: "completed",
          startsAt: now - 30 * DAY,
          expectedHeadcount: 120,
        },
        {
          venueId: "v1",
          stage: "planning",
          startsAt: now + 10 * DAY,
          expectedHeadcount: 140,
        },
      ],
      notes: [],
      now,
    });
    expect(due.reasons).toEqual([]);
  });

  it("asks Tier 3 partners every 3 months and after a problem since the last visit", () => {
    const due = siteVisitDue({
      venue: { _id: "v1", partnerTier: "full_event" },
      events: [],
      notes: [
        { venueId: "v1", category: "site_visit", postedAt: now - 100 * DAY },
        { venueId: "v1", category: "site_visit", postedAt: now - 200 * DAY },
        { venueId: "v1", category: "incident", postedAt: now - 150 * DAY },
        { venueId: "v1", category: "incident", postedAt: now - 2 * DAY },
        {
          venueId: "v1",
          category: "site_visit",
          postedAt: now - 1 * DAY,
          deletedAt: now,
        },
      ],
      now,
    });
    expect(due.lastVisitAt).toBe(now - 100 * DAY);
    expect(due.reasons).toEqual([
      "Tier 3 partners get a visit every 3 months. Last visit was 100 days ago.",
      "A problem was logged here since the last visit. Go and look.",
    ]);

    const fresh = siteVisitDue({
      venue: { _id: "v1", partnerTier: "full_event" },
      events: [],
      notes: [
        { venueId: "v1", category: "site_visit", postedAt: now - 30 * DAY },
      ],
      now,
    });
    expect(fresh.reasons).toEqual([]);
  });
});
