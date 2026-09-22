import { describe, expect, it } from "vitest";
import { proposalEventPrefill } from "../../../src/features/events/ProposalEventPrefill";
import { formatDate, formatTime } from "../../../src/lib/format";

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

  it("preview lists carried values", () => {
    const eventDate = new Date("2099-07-04T17:30").getTime();
    const eventEndDate = new Date("2099-07-04T22:00").getTime();
    const accepted = {
      deletedAt: null,
      status: "accepted",
      eventId: null,
      title: "Anniversary dinner",
      eventType: "dinner",
      eventDate,
      eventEndDate,
      guestCount: 40,
      venueName: "Garden",
      venueAddress: "100 Oak St",
    } as never;
    const preview = proposalEventPrefill.carryoverPreview({
      proposal: accepted,
      menuCount: 3,
      enhancementCount: 2,
    });
    expect(preview.rows.map((row) => row.key)).toEqual([
      "title",
      "type",
      "date",
      "times",
      "headcount",
      "venue",
      "menuCount",
      "enhancementCount",
    ]);
    expect(preview.rows.every((row) => row.willCarry)).toBe(true);
    const byKey = Object.fromEntries(
      preview.rows.map((row) => [row.key, row.value]),
    );
    expect(byKey.title).toBe("Anniversary dinner");
    expect(byKey.type).toBe("dinner");
    expect(byKey.date).toBe(formatDate(eventDate));
    expect(byKey.times).toBe(
      `Start ${formatTime(eventDate)} · End ${formatTime(eventEndDate)}`,
    );
    expect(byKey.headcount).toBe("40 guests");
    expect(byKey.venue).toBe("Garden — 100 Oak St");
    expect(byKey.menuCount).toBe("3 menu selections");
    expect(byKey.enhancementCount).toBe("2 enhancements");
    expect(preview.willLink).toBe(true);
    expect(preview.linkReason).toBe(
      "Creating this event links it to the proposal and copies its 3 menu selections onto the event.",
    );

    // A sparse draft carries nothing, and the copy reads honestly.
    const draft = proposalEventPrefill.carryoverPreview({
      proposal: { deletedAt: null, status: "draft", eventId: null } as never,
      menuCount: 0,
      enhancementCount: 0,
    });
    expect(draft.rows.every((row) => !row.willCarry)).toBe(true);
    const draftByKey = Object.fromEntries(
      draft.rows.map((row) => [row.key, row.value]),
    );
    expect(draftByKey.menuCount).toBe("None to copy");
    expect(draftByKey.enhancementCount).toBe("None to copy");
    for (const key of [
      "title",
      "type",
      "date",
      "times",
      "headcount",
      "venue",
    ]) {
      expect(draftByKey[key]).toBe(
        "Not on the proposal — set it on the event.",
      );
    }
    expect(draft.willLink).toBe(false);
    expect(draft.linkReason).toBe(
      "This proposal is draft — only an accepted proposal can be booked into an event.",
    );
  });
});
