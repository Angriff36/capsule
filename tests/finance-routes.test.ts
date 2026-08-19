import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  FINANCE_ROUTES,
  FINANCE_SECTIONS,
  InvoiceIssueLinkBuilder,
} from "../src/features/finance/financeRoutes";
import { CloseoutLifecyclePolicy } from "../src/features/finance/CloseoutLifecyclePolicy";
import { CommercialLifecyclePolicy } from "../src/features/finance/CommercialLifecyclePolicy";
import { PaymentMethodLifecyclePolicy } from "../src/features/finance/PaymentMethodLifecyclePolicy";
import { PayrollLifecyclePolicy } from "../src/features/finance/PayrollLifecyclePolicy";
import {
  EventCloseoutFinalizeLifecycle,
  InvoiceSendLifecycle,
  PaymentMethodExpireLifecycle,
  PaymentSettleLifecycle,
  PayrollInputFinalizeLifecycle,
} from "../src/generated/manifest-wiring-bindings";

describe("Finance routes and lifecycle bindings", () => {
  it("exposes invoice, payment, payment-method, closeout, and payroll sections", () => {
    expect(FINANCE_SECTIONS.map((section) => section.path)).toEqual([
      "/finance/invoices",
      "/finance/payments",
      "/finance/payment-methods",
      "/finance/closeout",
      "/finance/payroll",
    ]);
  });

  it("builds Client/Event → Invoice issue deep links", () => {
    const builder = new InvoiceIssueLinkBuilder();
    expect(builder.build({ clientId: "client_1" })).toBe(
      "/finance/invoices?issue=1&clientId=client_1",
    );
    expect(builder.build({ clientId: "client_1", eventId: "event_1" })).toBe(
      "/finance/invoices?issue=1&clientId=client_1&eventId=event_1",
    );
    expect(FINANCE_ROUTES.issueInvoice({ eventId: "event_9" })).toContain(
      "eventId=event_9",
    );
  });

  it("links invoice detail back to Client and Event sources", () => {
    const detail = readFileSync(
      path.join(process.cwd(), "src/features/finance/InvoiceDetailPage.tsx"),
      "utf8",
    );
    expect(detail).toContain("CLIENTS_ROUTES.detail");
    expect(detail).toContain("useListEvent");
    expect(detail).toContain("/events/${linkedEvent._id}");
  });

  it("deep-links EventCloseout rows into invoice issue", () => {
    const closeout = readFileSync(
      path.join(process.cwd(), "src/features/finance/CloseoutPage.tsx"),
      "utf8",
    );
    expect(closeout).toContain("FINANCE_ROUTES.issueInvoice");
    expect(closeout).toContain("Issue invoice");
  });

  it("wires finance routes in App.tsx", () => {
    const app = readFileSync(
      path.join(process.cwd(), "src/app/App.tsx"),
      "utf8",
    );
    expect(app).toContain('path="/finance/invoices"');
    expect(app).toContain('path="/finance/invoices/:id"');
    expect(app).toContain('path="/finance/payments"');
    expect(app).toContain('path="/finance/payment-methods"');
    expect(app).toContain('path="/finance/closeout"');
    expect(app).toContain('path="/finance/payroll"');
    expect(app).toContain("InvoicesPage");
    expect(app).toContain("InvoiceDetailPage");
    expect(app).toContain("PaymentsPage");
    expect(app).toContain("PaymentMethodsPage");
    expect(app).toContain("CloseoutPage");
    expect(app).toContain("PayrollPage");
  });

  it("derives invoice, payment, payment-method, closeout, and payroll actions from generated lifecycle metadata", () => {
    const policy = new CommercialLifecyclePolicy();
    const paymentMethods = new PaymentMethodLifecyclePolicy();
    const closeout = new CloseoutLifecyclePolicy();
    const payroll = new PayrollLifecyclePolicy();
    expect(
      policy.invoiceActions("draft", { amountDue: 900 }).map((a) => a.key),
    ).toEqual(expect.arrayContaining(["send", "void"]));
    expect(
      policy.invoiceActions("sent", { amountDue: 900 }).map((a) => a.key),
    ).toEqual(expect.arrayContaining(["markViewed", "markOverdue", "void"]));
    expect(policy.paymentActions("pending").map((a) => a.key)).toEqual(
      expect.arrayContaining(["beginProcessing", "settle", "fail"]),
    );
    expect(policy.paymentActions("completed").map((a) => a.key)).toEqual(
      expect.arrayContaining(["refund"]),
    );
    expect(
      paymentMethods.methodActions("active", false).map((a) => a.key),
    ).toEqual(
      expect.arrayContaining(["makeDefault", "expire", "invalidate", "remove"]),
    );
    expect(
      paymentMethods.methodActions("active", true).map((a) => a.key),
    ).toEqual(expect.arrayContaining(["clearDefault"]));
    expect(
      paymentMethods.methodActions("expired", false).map((a) => a.key),
    ).toEqual(expect.arrayContaining(["reactivate", "remove"]));
    expect(
      closeout.closeoutActions("draft", Date.now()).map((a) => a.key),
    ).toEqual(["finalize"]);
    expect(closeout.closeoutActions("draft", null)).toEqual([]);
    expect(closeout.closeoutActions("finalized", Date.now())).toEqual([]);
    expect(payroll.payrollActions("prepared").map((a) => a.key)).toEqual(
      expect.arrayContaining(["finalize", "void"]),
    );
    expect(payroll.payrollActions("finalized").map((a) => a.key)).toEqual([
      "void",
    ]);
    expect(InvoiceSendLifecycle[0]?.from).toBe("draft");
    expect(PaymentSettleLifecycle.map((t) => t.from)).toEqual(
      expect.arrayContaining(["pending", "processing"]),
    );
    expect(PaymentMethodExpireLifecycle[0]?.from).toBe("active");
    expect(EventCloseoutFinalizeLifecycle[0]?.from).toBe("draft");
    expect(PayrollInputFinalizeLifecycle[0]?.from).toBe("prepared");
  });

  it("never treats a $0-due draft as sendable (bulk select, bulk send, per-row send)", () => {
    const policy = new CommercialLifecyclePolicy();
    const sendKeys = (status: string, amountDue: unknown) =>
      policy.invoiceActions(status, { amountDue }).map((a) => a.key);

    // Positive balance drafts stay sendable.
    expect(sendKeys("draft", 900)).toContain("send");
    expect(sendKeys("draft", 0.01)).toContain("send");

    // $0-due (and malformed) drafts must not offer send, only the other
    // lifecycle actions (void stays available so QA drafts remain manageable).
    expect(sendKeys("draft", 0)).not.toContain("send");
    expect(sendKeys("draft", 0)).toContain("void");
    expect(sendKeys("draft", -25)).not.toContain("send");
    expect(sendKeys("draft", undefined)).not.toContain("send");
    expect(sendKeys("draft", null)).not.toContain("send");
    expect(sendKeys("draft", "not-a-number")).not.toContain("send");
  });

  it("selects only the 2 positive-due drafts out of the 4-row prod set", () => {
    // Mirrors the prod QA data: two $0-due drafts + two positive drafts.
    // Header "Select all sendable" must yield 2 (bar reads "Send 2"), and a
    // bulk send over all four must target only the positive rows.
    const policy = new CommercialLifecyclePolicy();
    const rows = [
      { _id: "inv-fri-lunch", status: "draft", amountDue: 0 },
      { _id: "inv-harborview-900", status: "draft", amountDue: 900 },
      { _id: "inv-harborview-0", status: "draft", amountDue: 0 },
      { _id: "inv-gallery-3600", status: "draft", amountDue: 3600 },
    ];
    const canSend = (row: { status: unknown; amountDue?: unknown }) =>
      policy
        .invoiceActions(String(row.status), row)
        .some((a) => a.key === "send");
    const sendableRows = rows.filter(canSend);
    expect(sendableRows.map((row) => row._id)).toEqual([
      "inv-harborview-900",
      "inv-gallery-3600",
    ]);
    // Bulk send re-filter: even if every row were ticked, no $0 row is sent.
    expect(rows.filter(canSend)).toHaveLength(2);
  });

  it("locks the InvoicesPage sendable wiring to the balance-aware predicate", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/features/finance/InvoicesPage.tsx"),
      "utf8",
    );
    // canSend and the per-row action list must both pass the row (with its
    // amountDue) into the policy — a status-only call reintroduces the bug.
    const balanceAwareCalls =
      page.match(/invoiceActions\(\s*String\(row\.status\),\s*row,?\s*\)/g) ??
      [];
    expect(balanceAwareCalls.length).toBeGreaterThanOrEqual(2);
    expect(page).not.toMatch(/invoiceActions\(\s*String\(row\.status\)\s*\)/);
    // Header select-all operates on the balance-filtered set.
    expect(page).toMatch(/sendableRows\s*=\s*visibleRows\.filter\(canSend\)/);
    expect(page).toMatch(/useBulkSelection\(sendableRows\)/);
    // Row checkbox renders only for sendable rows.
    expect(page).toMatch(/\{canSend\(row\)\s*\?\s*\(/);
    // Bulk send re-filters the selection before sending anything.
    expect(page).toMatch(/selection\.selected\.filter\(canSend\)/);
  });

  it("locks the InvoiceDetailPage actions to the balance-aware predicate", () => {
    const page = readFileSync(
      path.join(process.cwd(), "src/features/finance/InvoiceDetailPage.tsx"),
      "utf8",
    );
    expect(page).toMatch(
      /invoiceActions\(\s*String\(invoice\.status\),\s*invoice,?\s*\)/,
    );
    expect(page).not.toMatch(
      /invoiceActions\(\s*String\(invoice\.status\)\s*\)/,
    );
  });

  it("keeps the server-side zero-balance send refusal (manifest + generated command)", () => {
    // The Manifest domain is the authority: Invoice.send carries the
    // sendBalance constraint, and the generated Convex mutation enforces it
    // even if a stale or hostile client submits a $0-due draft.
    const manifest = readFileSync(
      path.join(process.cwd(), "src/sales/invoice-core.manifest"),
      "utf8",
    );
    expect(manifest).toMatch(
      /constraint\s+sendBalance:\s*self\.amountDue\s*>\s*0/,
    );

    const mutations = readFileSync(
      path.join(process.cwd(), "convex/mutations.ts"),
      "utf8",
    );
    expect(mutations).toContain("Cannot send an invoice with zero balance");
  });
});
