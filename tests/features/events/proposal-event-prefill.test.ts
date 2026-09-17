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
});
