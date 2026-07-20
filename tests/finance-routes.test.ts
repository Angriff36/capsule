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
    expect(policy.invoiceActions("draft").map((a) => a.key)).toEqual(
      expect.arrayContaining(["send", "void"]),
    );
    expect(policy.invoiceActions("sent").map((a) => a.key)).toEqual(
      expect.arrayContaining(["markViewed", "markOverdue", "void"]),
    );
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
});
