import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Words the owner banned from user-visible copy (2026-09-23).
const FORBIDDEN =
  /\b(idempotency|tenant|seam|projection|canonical|hydrate|mapped|reaction|guard|policy|constraint|manifest|convex|builder|directory|record)\b/i;

function expectPlain(text: string) {
  expect(text).not.toMatch(FORBIDDEN);
  expect(text).not.toContain("CONVEX_FIELD_ENCRYPTION_KEY");
  expect(text).not.toContain("bun run");
}

describe("plain words on sales screens", () => {
  it("keeps leftover sales quote contract and acceptance copy free of record jargon", () => {
    const files = [
      "src/features/sales/QuoteSubmissionsReviewPage.tsx",
      "src/features/sales/QuoteSubmissionPage.tsx",
      "src/features/clients/ProposalAcceptancePage.tsx",
      "src/features/clients/ClientCommunicationPanel.tsx",
      "src/features/clients/ContractsPage.tsx",
      "src/features/clients/ContractDocumentPage.tsx",
      "src/features/clients/contractPdf.ts",
      "src/features/clients/ClientDetailPage.tsx",
      "src/features/clients/ProposalReadinessNotice.tsx",
    ];
    const contents = Object.fromEntries(
      files.map((path) => [path, readFileSync(path, "utf8")]),
    );
    const all = Object.values(contents).join("\n");

    for (const old of [
      "organization record",
      "Records already created are linked on its row",
      "data will be handled according to the privacy policy",
      "Your acceptance has been recorded",
      "Unable to record acceptance",
      "Recording…",
      "This acceptance is being recorded for",
      '"Date not recorded"',
      "before recording a conversation",
      "then record it sent here",
      '"Record sent"',
      "belongs to another tenant",
      "No additional terms recorded on this contract",
      '<Section label="Cancellation policy">',
      "Signature recorded in Capsule by",
      '"Not recorded"',
      "Client signature recorded",
      "check mapped fields against the source",
    ]) {
      expect(all).not.toContain(old);
    }

    for (const fresh of [
      "company profile",
      "Anything already created is linked on its row, and Retry conversion reuses them.",
      "data will be handled according to our privacy notice",
      "Your acceptance is saved",
      "Couldn't save your acceptance",
      "Saving…",
      "This acceptance is for",
      '"No date on file"',
      "before saving a conversation",
      "then mark it sent here",
      '"Mark sent"',
      "belongs to another workspace",
      "No extra terms on this contract",
      '<Section label="If you cancel">',
      "Signed in Capsule by",
      '"Not on file"',
      "Client signed",
      "check the copied fields against the source",
    ]) {
      expect(all).toContain(fresh);
    }

    // The fresh user-visible strings must themselves be plain catering English.
    for (const fresh of [
      "company profile, so new quote requests are refused",
      "Anything already created is linked on its row, and Retry conversion reuses them.",
      "data will be handled according to our privacy notice",
      "Your acceptance is saved",
      "Couldn't save your acceptance",
      "This acceptance is for",
      "No date on file",
      "Add an active contact before saving a conversation.",
      "No extra terms on this contract.",
      "If you cancel",
      "Not on file",
    ]) {
      expectPlain(fresh);
    }
  });

  it("keeps leftover sales-manifest policy copy free of command jargon", () => {
    const files = [
      "src/sales/client-communication.manifest",
      "src/sales/client-retention.manifest",
      "src/sales/contact.manifest",
      "src/sales/contract.manifest",
      "src/sales/credit-memo.manifest",
      "src/sales/invoice-core.manifest",
      "src/sales/invoice-number-sequence.manifest",
      "src/sales/lead.manifest",
      "src/sales/message-thread.manifest",
      "src/sales/message.manifest",
      "src/sales/payment-method.manifest",
      "src/sales/payment.manifest",
      "src/sales/proposal-dish-selection.manifest",
      "src/sales/proposal-enhancement.manifest",
      "src/sales/proposal-line-item.manifest",
      "src/sales/proposal-revision.manifest",
      "src/sales/proposal-template.manifest",
      "src/sales/proposal.manifest",
      "src/sales/quote-submission.manifest",
      "src/sales/referral-source.manifest",
      "src/sales/share-link.manifest",
      "src/sales/signature-request.manifest",
      "src/sales/sync-error.manifest",
      "src/sales/tax-rate.manifest",
    ];
    // strip // comments so developer notes are not treated as user copy
    const visible = files
      .map((path) => readFileSync(path, "utf8"))
      .join("\n")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    for (const old of [
      "through commands",
      "execute invoice commands",
      "execute proposal commands",
      "execute quote submission",
      "numbering seam",
      "implementation records",
      "generated commands",
      "record client communication",
      "Recorded communication",
    ]) {
      expect(visible).not.toContain(old);
    }

    for (const fresh of [
      "Finance staff and managers may update invoices",
      "Finance staff and managers may change invoices",
      "Sales staff may update proposal dish selections",
      "Sales staff may change proposal dish selections",
      "Sales staff may update proposals",
      "Sales staff may change proposals",
      "Sales staff may update signature requests",
      "Sales staff and clients may change signature requests",
      "Anyone may check a quote request",
      "Anyone may send a quote request",
      "Invoice numbers are assigned automatically",
      "Only Capsule can update invoice number counters",
      "Invoice number counters stay behind the scenes",
      "Sales staff may update proposal templates",
      "Sales staff may change proposal templates",
      "Sales staff may update proposal enhancements",
      "Sales staff may change proposal enhancements",
      "Staff may update connection problems",
      "Staff may change connection problems",
      "Sales staff may update share links",
      "Sales staff may change share links",
      "Sales staff may update proposal line items",
      "Sales staff may change proposal line items",
      "Sales staff may update proposal revisions",
      "Sales staff may change proposal revisions",
      "Staff may update conversations",
      "Staff may change conversations",
      "Staff may update messages",
      "Staff may change messages",
      "Finance staff may update payments",
      "Finance staff may change payments",
      "Finance staff may change tax rates",
      "Sales managers may update referral sources",
      "Sales managers may change referral sources",
      "Finance staff may update payment methods",
      "Finance staff may change payment methods",
      "Sales staff may update leads",
      "Sales staff may change leads",
      "Finance staff may update credit memos",
      "Finance staff may change credit memos",
      "Sales staff may update contracts",
      "Sales staff may change contracts",
      "Sales staff may update client contacts",
      "Sales staff may change client contacts",
      "Sales staff may update client follow-up reminders",
      "Sales staff may change client follow-up reminders",
      "Staff may add client notes",
      "Staff may change client notes",
      "A saved note needs one contact or event, date, summary, and author",
    ]) {
      expect(visible).toContain(fresh);
      expectPlain(fresh);
    }
  });
});
