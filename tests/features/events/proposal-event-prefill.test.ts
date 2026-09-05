import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { proposalEventPrefill } from "../../../src/features/events/ProposalEventPrefill";

// AC-003: venue match resolves the saved Venue; the mismatch is visible on
// the create screen instead of silent. AC-006: the create-event preview
// lists exactly which proposal values carry over (and the C6 seam test for
// ProposalEventPrefill.values, including the C2 endsAtLocal).
describe("ProposalEventPrefill", () => {
  it("venue match and mismatch notice", () => {
    const venues = [
      { _id: "v1", name: "  riverside HALL " },
      { _id: "v2", name: "Harbor Loft" },
    ] as never;

    // Case/whitespace-insensitive hit.
    expect(
      proposalEventPrefill.matchVenue(
        { venueName: "Riverside Hall " } as never,
        venues,
      )?._id,
    ).toBe("v1");
    // Miss and blank venue name resolve nothing, without throwing.
    expect(
      proposalEventPrefill.matchVenue(
        { venueName: "Nowhere Hall" } as never,
        venues,
      ),
    ).toBeUndefined();
    expect(
      proposalEventPrefill.matchVenue({ venueName: "   " } as never, venues),
    ).toBeUndefined();

    // The miss is visible to the operator on the create screen (source-text),
    // and a hit auto-selects the saved venue (venueId carry-over).
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toContain("No saved venue matched");
    expect(page).toContain("create it in the Venue panel");
    expect(page).toContain(
      "proposalEventPrefill.matchVenue(proposal, activeVenues)",
    );
    expect(page).toContain("setVenueId((current) => current || match._id)");
  });

  it("preview lists carried values", () => {
    const proposal = {
      _id: "p1",
      title: "Autumn gala",
      eventType: "gala dinner",
      eventDate: Date.parse("2026-10-01T18:00:00Z"),
      eventEndDate: Date.parse("2026-10-01T23:00:00Z"),
      guestCount: 80,
      total: 1300,
    } as never;

    const values = proposalEventPrefill.values(proposal);
    expect(values.title).toBe("Autumn gala");
    expect(values.eventType).toBe("gala dinner");
    expect(values.expectedHeadcount).toBe(80);
    expect(values.quotedPrice).toBe(1300);
    // datetime-local strings round-trip: the form mapper parses them back to
    // the same instants (local time, minute precision — C2 proof pattern).
    expect(Date.parse(values.startsAtLocal as string)).toBe(
      (proposal as { eventDate: number }).eventDate,
    );
    expect(Date.parse(values.endsAtLocal as string)).toBe(
      (proposal as { eventEndDate: number }).eventEndDate,
    );
    // A proposal without an end time leaves endsAtLocal unset — the create
    // screen says so instead of silently leaving the field blank.
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

    // Every carried value has a visible line on the create screen
    // (source-text): title, type, headcount, money, date, times, venue,
    // menu count, enhancement count, and why linking will (not) happen.
    const page = readFileSync(
      "src/features/events/EventCreatePage.tsx",
      "utf8",
    );
    expect(page).toContain("{proposal.title}");
    expect(page).toContain("proposal.eventType");
    expect(page).toContain("proposal.guestCount");
    expect(page).toContain("formatMoneyExact(Number(proposal.total ?? 0))");
    expect(page).toContain("Starts: ${formatDate(proposal.eventDate)}");
    expect(page).toContain("Ends: ${formatDate(proposal.eventEndDate)}");
    expect(page).toContain("No end time on the proposal");
    expect(page).toContain("Venue: {proposal.venueName}");
    expect(page).toContain("proposalMenuCount");
    expect(page).toContain("Enhancements: {proposalEnhancementCount}");
    expect(page).toContain("useListProposalEnhancement");
    expect(page).toContain("row.removedAt == null");
    expect(page).toContain("Creating this event links it to the proposal");
    expect(page).toContain(
      "Already booked — this proposal is linked to an event",
    );
    expect(page).toContain("will be created without linking it");
  });
});
