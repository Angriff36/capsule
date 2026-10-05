import { describe, expect, it } from "vitest";
import {
  AGREEMENT_PREFIX,
  FIRST_MEETING_PREFIX,
  ONBOARDED_PREFIX,
  REVIEW_PREFIX,
  TEAM_BRIEF_PREFIX,
  missingVenueFile,
  onboardingStatus,
  teamBriefDraft,
} from "../../src/features/facilities/venueOnboarding";

const DAY = 86_400_000;
const since = Date.UTC(2026, 8, 1);
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const fullVenue = {
  _id: "v1",
  partnerTier: "pilot",
  partnerSince: since,
  addressLine1: "1 Garden Way",
  contactName: "Sarah",
  contactPhone: "555-0100",
  capacity: 150,
  kitchenAccess: "Warming kitchen",
  loadInInstructions: "Back door by the garage",
  parkingAvailable: true,
  powerAvailable: true,
  restrictions: "No confetti; music off at 11",
};

const note = (
  category: string,
  content: string,
  postedAt: number,
  eventId?: string,
) => ({ venueId: "v1", category, content, postedAt, eventId });

describe("getting a new partner venue started (playbook section 04)", () => {
  it("is nothing for a venue that is not a partner", () => {
    expect(
      onboardingStatus({
        venue: { _id: "v1" },
        notes: [],
        events: [],
        venueOnlyDishCount: 0,
        now: since,
        formatDate: day,
      }),
    ).toBeNull();
  });

  it("names the blank venue file details", () => {
    expect(missingVenueFile({ _id: "v1", capacity: 0 })).toEqual([
      "address",
      "venue contact",
      "capacity",
      "kitchen",
      "load-in",
      "parking",
      "power",
      "rules (candles, confetti, noise)",
    ]);
    expect(missingVenueFile(fullVenue)).toEqual([]);
  });

  it("reminds about late steps on the playbook's week-by-week timeline", () => {
    const status = onboardingStatus({
      venue: { ...fullVenue, parkingAvailable: null },
      notes: [
        note("check_in", `${FIRST_MEETING_PREFIX}Met Sarah`, since + DAY),
      ],
      events: [],
      venueOnlyDishCount: 0,
      now: since + 16 * DAY,
      formatDate: day,
    })!;
    expect(status.doneCount).toBe(2);
    expect(status.finished).toBe(false);
    const file = status.steps.find((step) => step.key === "file")!;
    expect(file.missing).toEqual(["parking"]);
    expect(status.reminders).toEqual([
      "Getting started: venue file filled in was due 2026-09-15",
      "Getting started: site visit was due 2026-09-15",
    ]);
  });

  it("counts the site visit, venue-only dishes, brief, first event debrief and review", () => {
    const first = since + 40 * DAY;
    const status = onboardingStatus({
      venue: fullVenue,
      notes: [
        note("check_in", `${FIRST_MEETING_PREFIX}Met`, since + DAY),
        note("site_visit", "Kitchen: small", since + 5 * DAY),
        note("check_in", `${AGREEMENT_PREFIX}Signed`, since + 20 * DAY),
        note(
          "logistics",
          `${TEAM_BRIEF_PREFIX}Address: 1 Garden Way`,
          since + 21 * DAY,
        ),
        note("debrief", "Went well", first + DAY, "e1"),
        note("check_in", `${REVIEW_PREFIX}Tier is right`, first + 30 * DAY),
      ],
      events: [
        {
          _id: "e0",
          venueId: "v1",
          stage: "cancelled",
          startsAt: since + 10 * DAY,
        },
        { _id: "e1", venueId: "v1", stage: "planning", startsAt: first },
        {
          _id: "e2",
          venueId: "v2",
          stage: "planning",
          startsAt: since + 3 * DAY,
        },
      ],
      venueOnlyDishCount: 1,
      now: first + 31 * DAY,
      formatDate: day,
    })!;
    expect(status.steps.filter((step) => step.doneAt == null)).toEqual([]);
    expect(status.finished).toBe(true);
    expect(status.finishedAt).toBe(first + 30 * DAY);
    expect(status.reminders).toEqual([]);
  });

  it("wants the debrief for the first event, and skips the menu reminder when dishes are unknown", () => {
    const first = since + 30 * DAY;
    const status = onboardingStatus({
      venue: fullVenue,
      notes: [note("debrief", "Other event", first + DAY, "e9")],
      events: [
        { _id: "e1", venueId: "v1", stage: "planning", startsAt: first },
      ],
      venueOnlyDishCount: null,
      now: first + 3 * DAY,
      formatDate: day,
    })!;
    const firstEvent = status.steps.find((step) => step.key === "firstEvent")!;
    expect(firstEvent.doneAt).toBeNull();
    expect(firstEvent.detail).toContain("debrief within 48 hours");
    expect(status.reminders.some((line) => line.includes("venue menu"))).toBe(
      false,
    );
    expect(
      status.reminders.some((line) =>
        line.includes("first event, with a debrief"),
      ),
    ).toBe(true);
  });

  it("lets a venue set up before these steps be marked finished", () => {
    const status = onboardingStatus({
      venue: { _id: "v1", partnerTier: "core", partnerSince: since },
      notes: [note("check_in", `${ONBOARDED_PREFIX}Old partner`, since + DAY)],
      events: [],
      venueOnlyDishCount: 0,
      now: since + 90 * DAY,
      formatDate: day,
    })!;
    expect(status.finished).toBe(true);
    expect(status.reminders).toEqual([]);
  });

  it("starts the team brief from the venue file", () => {
    expect(
      teamBriefDraft({
        venue: {
          ...fullVenue,
          city: "Ames",
          hasOven: false,
          loadOutBy: "23:30",
        },
      }),
    ).toBe(
      [
        "Address: 1 Garden Way, Ames",
        "Load-in: Back door by the garage, out by 23:30",
        "Key contacts: Sarah, 555-0100",
        "Kitchen: Warming kitchen, no oven",
        "Quirks and rules: No confetti; music off at 11",
        "Emergency contacts: ",
      ].join("\n"),
    );
  });
});
