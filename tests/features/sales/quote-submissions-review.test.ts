import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-text assertions (repo style — no @testing-library): the queue page
// must show all seven submitted fields the spec names (public-quote-form.md
// acceptance #1): contact, event date, guest count, service style, occasion,
// venue text and menu selections. Style/occasion resolve to catalog names via
// the live lists (retired rows still resolve), and an unset value reads
// "Not specified" instead of a silent blank.
const page = readFileSync(
  "src/features/sales/QuoteSubmissionsReviewPage.tsx",
  "utf8",
);

describe("quote submissions review queue", () => {
  it("queue shows all seven submitted fields", () => {
    // 1) contact — name, email, phone
    expect(page).toContain("sub.clientName");
    expect(page).toContain("sub.email");
    expect(page).toContain("sub.phone");
    // 2) event date, 3) guest count
    expect(page).toContain("sub.eventDate");
    expect(page).toContain("sub.guestCount");
    // 4) service style + 5) occasion — resolved from the live catalog lists,
    // never rendered as raw ids
    expect(page).toContain("useListServiceStyle");
    expect(page).toContain("useListOccasion");
    expect(page).toContain("sub.serviceStyleId");
    expect(page).toContain("sub.occasionId");
    // retired catalog rows must still resolve: lookup by id only
    expect(page).toContain("row._id === id");
    // visible labels for the two resolved fields
    expect(page).toContain("Style:");
    expect(page).toContain("Occasion:");
    // unset style/occasion reads "Not specified"
    expect(page).toContain('"Not specified"');
    // 6) venue text
    expect(page).toContain("sub.venueName");
    expect(page).toContain("sub.venueAddress");
    // 7) menu selections
    expect(page).toContain("sub.menuPreferences");
    expect(page).toContain("sub.dietaryRestrictions");
  });

  // AC-010 UI wiring: dismiss runs through the generated command with a
  // REQUIRED reason, dismissed rows leave the default queue behind a
  // "Show dismissed" filter (retained, never deleted), and the reason is
  // shown on the row.
  it("dismiss hides from the default queue and keeps the raw row", () => {
    expect(page).toContain("useQuoteSubmissionDismiss");
    expect(page).toContain("askReason");
    // hidden by default, reachable via the toggle
    expect(page).toContain("Show dismissed");
    expect(page).toContain('sub.status !== "dismissed"');
    // the dismiss reason is shown on the dismissed row (raw row stays readable)
    expect(page).toContain("Dismissed —");
    // the reason prompt cancels on a blank reason (required reason)
    expect(page).toContain("if (!reason) return;");
    // chip tone comes from the shared status vocabulary, not a private map
    expect(page).not.toContain("STATUS_TONE");
    const statusLabels = readFileSync("src/lib/statusLabels.ts", "utf8");
    expect(statusLabels).toContain('dismissed: "mute"');
  });

  // A5 / AC-011: when the catalogs were empty the prospect answered as free
  // text; the queue shows that text (id name → captured text → "Not
  // specified"), never a silent blank.
  it("queue shows free-text style and occasion answers", () => {
    expect(page).toContain("sub.serviceStyleText");
    expect(page).toContain("sub.occasionText");
  });

  // AC-014: a missing organization row is reported to STAFF with a link to
  // where the record is created — the public form refuses every submit in
  // that state (issue #119), and that must not stay invisible to sales.
  it("offline notice when no organization", () => {
    // reads the live organization list
    expect(page).toContain("useListOrganization");
    // the notice keys on an ACTIVE row (and not while the list is loading)
    expect(page).toContain("publicFormOffline");
    expect(page).toContain('org.status === "active"');
    // staff-facing message + link to where the organization row is created
    expect(page).toContain("quote form is offline");
    expect(page).toContain('"/admin/branding"');
  });

  // AC-018: after conversion, sales reaches the created proposal in ONE
  // click from the quote queue and from the lead pipeline. Both deep-link
  // into the proposals page's focused row (?proposal=<id> opens its panels
  // and scrolls it into view) instead of the generic list, and the quote
  // queue itself is reachable from the pipeline page.
  it("queue and pipeline deep-link to the converted proposal", () => {
    const pipeline = readFileSync(
      "src/features/clients/LeadPipelinePage.tsx",
      "utf8",
    );
    const routes = readFileSync(
      "src/features/clients/clientsRoutes.ts",
      "utf8",
    );
    const proposals = readFileSync(
      "src/features/clients/ProposalsPage.tsx",
      "utf8",
    );
    // shared route builder targets the focused-proposal URL param
    expect(routes).toContain("?proposal=${id}");
    // the queue links the created proposal: on the completed row and in the
    // just-converted banner (the action result carries proposalId)
    expect(page).toContain("sub.proposalId");
    expect(page).toContain("CLIENTS_ROUTES.proposal(");
    expect(page).toContain("result.proposalId");
    // the pipeline card's "Open proposal" uses the same deep link, not the
    // generic proposals list
    expect(pipeline).toContain("CLIENTS_ROUTES.proposal(lead.proposalId)");
    expect(pipeline).not.toContain("CLIENTS_ROUTES.proposals");
    // the proposals page consumes the param, so the link lands on the real
    // proposal (no dead link)
    expect(proposals).toContain('searchParams.get("proposal")');
    // the quote queue is reachable from the pipeline page
    expect(pipeline).toContain("CLIENTS_ROUTES.quoteRequests");
  });

  // AC-019: a conversion that failed part-way shows which records were
  // already created — the checkpointed ids render as links on the FAILED row
  // (client, pipeline, event, proposal), same components as completed rows —
  // and the row can be retried (failed reopens as pending; the conversion
  // reuses the checkpointed records) and dismissed.
  it("failed row shows checkpointed records", () => {
    // failed rows render the checkpointed record links, not just the error
    expect(page).toContain('sub.status === "failed"');
    expect(page).toContain("CLIENTS_ROUTES.proposal(sub.proposalId)");
    expect(page).toContain("CLIENTS_ROUTES.detail(sub.clientId)");
    expect(page).toContain("CLIENTS_ROUTES.pipeline");
    expect(page).toContain("sub.eventId");
    // retry: reopen (failed → pending, ids kept) then convert, which reuses
    // the checkpointed records instead of duplicating them
    expect(page).toContain("useQuoteSubmissionRetry");
    expect(page).toContain("Retry conversion");
    // the failed row keeps its dismiss action (guard: pending or failed)
    expect(page).toContain("canDismiss");
    // the retry command is failed-only, exactly as the UI assumes
    const manifest = readFileSync(
      "src/sales/quote-submission.manifest",
      "utf8",
    );
    expect(manifest).toContain(
      'guard self.status == "failed" "Only failed submissions can be retried"',
    );
  });
});
