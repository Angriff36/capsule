import { describe, expect, it } from "vitest";
import { isRegularVenue } from "../src/features/facilities/venuePartnership";

// Issue #442: the venue list shows partner and exclusive-contract venues by
// default; every other venue is only a place an event once happened.
describe("isRegularVenue", () => {
  it("keeps partner venues and exclusive-contract venues", () => {
    expect(isRegularVenue({ partnerTier: "catering_only" })).toBe(true);
    expect(isRegularVenue({ exclusiveContract: true })).toBe(true);
  });

  it("leaves out venues from past events only", () => {
    expect(isRegularVenue({})).toBe(false);
    expect(
      isRegularVenue({ partnerTier: null, exclusiveContract: false }),
    ).toBe(false);
  });
});
