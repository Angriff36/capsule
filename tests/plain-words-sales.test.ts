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
});
