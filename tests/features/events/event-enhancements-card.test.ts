import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AC-005 (visible half): the event overview renders an Enhancements card
// that reaches the proposal through the reverse lookup and lists only live
// rows (withdraw sets removedAt + deletedAt). The card lives in clients/
// beside the other Proposal readers — the event-feature guard allows direct
// useQuery in EventGuestPanel only. The runtime half is the booking proof ›
// "accepted enhancements reachable from the event".
describe("event overview enhancements card", () => {
  it("event detail lists live enhancements from the linked proposal", () => {
    const card = readFileSync(
      "src/features/clients/EventProposalEnhancementsCard.tsx",
      "utf8",
    );
    // Reverse lookup first, then live rows on the resolved proposal.
    expect(card).toContain("api.queries.listProposalByEventId");
    expect(card).toContain("api.queries.listProposalEnhancementByProposalId");
    expect(card).toContain("removedAt == null");
    // No proposal linked or nothing live → no card, never a crash.
    expect(card).toContain("rows.length === 0");
    expect(card).toContain("return null");

    const tab = readFileSync(
      "src/features/events/EventOverviewTab.tsx",
      "utf8",
    );
    expect(tab).toContain(
      "<EventProposalEnhancementsCard eventId={eventId} />",
    );
  });
});
