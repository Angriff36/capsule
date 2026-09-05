import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// AC-002 (visible half): the event overview shows which proposal booked it
// and which revision was accepted — reverse lookup (Proposal.eventId), then
// the completed signature request's revision, else the highest
// revisionNumber, else "no revision captured" (agent bundle path, #241). The
// card lives in clients/ beside the other Proposal readers — the
// event-feature guard allows direct useQuery in EventGuestPanel only. The
// runtime half is the booking proof › "event resolves its proposal and
// accepted revision".
describe("event overview proposal source card", () => {
  it("event detail links the booking proposal and its accepted revision", () => {
    const card = readFileSync(
      "src/features/clients/EventProposalSourceCard.tsx",
      "utf8",
    );
    // Reverse lookup first — the link never rides on a free-text copy.
    expect(card).toContain("api.quoteBuilder.getEventBookingDetails");
    // Revision sources: the signed revision wins over the highest number.
    const projection = readFileSync("convex/quoteBuilder.ts", "utf8");
    expect(projection).toContain('query("signatureRequests")');
    expect(projection).toContain('query("proposalRevisions")');
    expect(projection.indexOf('status === "completed"')).toBeLessThan(
      projection.indexOf("revisionNumber - "),
    );
    // The agent path (no revision) stays visible as words, never a crash.
    expect(projection).toContain("no revision captured");
    expect(card).toContain("return null");
    // One click to the proposal: the deep link opens its focused row.
    expect(card).toContain("CLIENTS_ROUTES.proposal(");

    const tab = readFileSync(
      "src/features/events/EventOverviewTab.tsx",
      "utf8",
    );
    expect(tab).toContain("<EventProposalSourceCard eventId={eventId} />");
  });
});
