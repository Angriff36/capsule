import { describe, expect, it } from "vitest";
import { proposalEventPrefill } from "../../../src/features/events/ProposalEventPrefill";

describe("ProposalEventPrefill", () => {
  it("leaves an absent end date unset and links only accepted unbooked proposals", () => {
    expect(
      proposalEventPrefill.values({ title: "T", total: 1 } as never)
        .endsAtLocal,
    ).toBeUndefined();

    // Linking happens only for a live, accepted, still-unlinked proposal.
    expect(
      proposalEventPrefill.canLinkOnCreate({
        deletedAt: null,
        status: "accepted",
        eventId: null,
      } as never),
    ).toBe(true);
    expect(
      proposalEventPrefill.canLinkOnCreate({
        deletedAt: null,
        status: "draft",
        eventId: null,
      } as never),
    ).toBe(false);
    expect(
      proposalEventPrefill.canLinkOnCreate({
        deletedAt: null,
        status: "accepted",
        eventId: "evt1",
      } as never),
    ).toBe(false);
  });

  // Issue #393: a venue-name match is automatic only when it is unambiguous —
  // two saved venues with the same name must never silently pick the first.
  it("auto-selects a unique venue-name match and refuses to pick between same-named venues", () => {
    const garden = { _id: "venue-a", name: "Garden" };
    const gardenLake = { _id: "venue-b", name: "garden" };
    const hall = { _id: "venue-c", name: "Hall" };
    const proposal = { venueName: "  GARDEN  " };
    const venues = [garden, gardenLake, hall] as never;

    expect(proposalEventPrefill.matchVenue(proposal as never, venues)).toBe(
      undefined,
    );
    expect(
      proposalEventPrefill.venueMatches(proposal as never, venues),
    ).toEqual([garden, gardenLake]);
    expect(
      proposalEventPrefill.matchVenue(proposal as never, [garden] as never),
    ).toBe(garden);
    expect(
      proposalEventPrefill.matchVenue(proposal as never, [hall] as never),
    ).toBeUndefined();
    expect(
      proposalEventPrefill.matchVenue({ venueName: "   " } as never, venues),
    ).toBeUndefined();
  });
});
