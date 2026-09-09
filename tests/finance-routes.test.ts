import { describe, expect, it } from "vitest";

import path from "node:path";
import {
  FINANCE_ROUTES,
  FINANCE_SECTIONS,
  InvoiceIssueLinkBuilder,
} from "../src/features/finance/financeRoutes";
import { CloseoutLifecyclePolicy } from "../src/features/finance/CloseoutLifecyclePolicy";
import { CommercialLifecyclePolicy } from "../src/features/finance/CommercialLifecyclePolicy";
import { PaymentsLedgerPresenter } from "../src/features/finance/PaymentsLedgerPresenter";
import {
  formatInvoiceNumber,
  invoiceNumberFormatter,
} from "../src/features/finance/invoiceNumberDisplay";
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

  it("default payments view never claims a bare 0 while settled rows exist", () => {
    // QA 176 FAIL on prod: default badge still "0 PAYMENTS" with $15,300
    // COMPLETED hidden, no notice, one row showing raw invoice id
    // NN74XC7N0PDK5CMKM5Z8ZN7GBD8BDP6Q. Control-only is not enough.
    const presenter = new PaymentsLedgerPresenter();
    const rows = [
      { status: "COMPLETED", amount: 11700, settledAt: 1 },
      { status: "completed", amount: 3600, settledAt: 2 },
    ];
    expect(presenter.isTerminal("COMPLETED")).toBe(true);
    expect(presenter.isTerminal("completed")).toBe(true);
    expect(presenter.openRows(rows)).toHaveLength(0);

    const summary = presenter.settledSummary(rows);
    expect(summary.hiddenCount).toBe(2);
    expect(summary.completedCount).toBe(2);
    expect(summary.completedTotal).toBe(15300);

    // Heading count is honest — never a bare "0 payments" with money hidden.
    expect(presenter.countLabel(0, summary.hiddenCount, false)).toBe(
      "0 open · 2 settled",
    );
    expect(presenter.countLabel(0, summary.hiddenCount, false)).not.toBe(
      "0 payments",
    );
    expect(presenter.headingCount(rows, false)).toBe("0 open · 2 settled");
    // Empty state names the filter and the hidden total.
    const notice = presenter.hiddenSettledNotice(summary);
    expect(notice).toContain("2 completed payments");
    expect(notice).toContain("$15,300.00");
    expect(notice).toContain("hidden by the open-payments view");
    // The reveal is one click with an honest count.
    expect(presenter.showSettledLabel(summary)).toBe("Show 2 settled payments");
    expect(presenter.mastheadSettledLabel(summary, false)).toBe(
      "Show 2 settled payments",
    );
    expect(presenter.mastheadSettledLabel(summary, true)).toBe("Hide settled");
    expect(
      presenter.mastheadSettledLabel(presenter.settledSummary([]), false),
    ).toBe("Show settled");

    // Once revealed (or with truly zero rows) the plain copy is fine.
    expect(presenter.countLabel(2, summary.hiddenCount, true)).toBe(
      "2 payments",
    );
    expect(presenter.headingCount(rows, true)).toBe("2 payments");
    expect(presenter.countLabel(0, 0, false)).toBe("0 payments");
    expect(presenter.hiddenSettledNotice(presenter.settledSummary([]))).toBe(
      null,
    );

    // Mixed terminal rows stay honest: failed/refunded count, completed total.
    const mixed = presenter.settledSummary([
      { status: "completed", amount: 500 },
      { status: "failed", amount: 100 },
      { status: "refunded", amount: 250 },
      { status: "pending", amount: 75 },
    ]);
    expect(mixed.hiddenCount).toBe(3);
    expect(mixed.completedTotal).toBe(500);
    expect(presenter.hiddenSettledNotice(mixed)).toContain(
      "3 settled payments",
    );
    expect(presenter.hiddenSettledNotice(mixed)).toContain("$500.00");
  });

  it("treats uppercase 32-char invoice ids as raw document ids", () => {
    const raw = "NN74XC7N0PDK5CMKM5Z8ZN7GBD8BDP6Q";
    expect(invoiceNumberFormatter.isRawDocumentId(raw)).toBe(true);
    expect(formatInvoiceNumber(raw, "jx7invoiceidxxxxxxxxxxxxxx8bd5qp")).toBe(
      "INV-8BD5QP",
    );
    expect(formatInvoiceNumber("INV-2026-QA1", "anything")).toBe(
      "INV-2026-QA1",
    );
  });
});
