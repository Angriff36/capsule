/**
 * Venue-exclusive menu items: the event menu's dish picker says when a dish
 * is offered only at one venue, and never blocks adding it.
 */
import { describe, expect, it } from "vitest";
import { venueExclusiveNote } from "../../src/features/events/venueExclusiveNote";

const names = new Map([["venue-kindred", "Kindred + Co."]]);

describe("venue-exclusive dish note", () => {
  it("says nothing for a dish offered anywhere", () => {
    expect(venueExclusiveNote(null, "venue-kindred", names)).toBeNull();
  });
  it("marks a dish made for this event's venue", () => {
    expect(venueExclusiveNote("venue-kindred", "venue-kindred", names)).toBe(
      "Made for this venue",
    );
  });
  it("names the other venue, or says another venue when unknown", () => {
    expect(venueExclusiveNote("venue-kindred", "venue-barn", names)).toBe(
      "Only at Kindred + Co.",
    );
    expect(venueExclusiveNote("venue-gone", null, names)).toBe(
      "Only at another venue",
    );
  });
});
