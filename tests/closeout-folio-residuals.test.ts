import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  "src/features/finance/EventCostSummaryReport.css",
  "utf8",
);
const report = readFileSync(
  "src/features/finance/EventCostSummaryReport.tsx",
  "utf8",
);
const note = readFileSync(
  "src/features/finance/CloseoutBillingTruth.tsx",
  "utf8",
);

describe("closeout folio follows theme and lists draft numbers", () => {
  it("paints folio paper/ink from inherited --color-*, not cream", () => {
    expect(css).toContain("--folio-paper: var(--color-panel)");
    expect(css).toContain("--folio-ink: var(--color-ink)");
    expect(css).toContain("var(--folio-paper)");
    expect(css).not.toContain("#f4f0e5");
    expect(css).not.toContain("#1f2925");
    expect(css).not.toContain("rgba(244, 240, 229");
  });

  it("names billed and draft invoices separately on the folio", () => {
    expect(report).toContain("Invoices: {summary.invoiceNumbers.join(");
    expect(report).toContain("Drafts: {summary.draftInvoiceNumbers.join(");
  });

  it("Event subtext does not repeat the Billed column", () => {
    expect(note).not.toContain(
      "`Billed ${formatMoneyExact(billing.billedTotal)}`",
    );
  });
});
