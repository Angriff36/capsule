import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { FINANCE_SECTIONS } from "../src/features/finance/financeRoutes";
import { CommercialLifecyclePolicy } from "../src/features/finance/CommercialLifecyclePolicy";
import {
  InvoiceSendLifecycle,
  PaymentSettleLifecycle,
} from "../src/generated/manifest-wiring-bindings";

describe("Finance routes and lifecycle bindings", () => {
  it("exposes invoice and payment sections", () => {
    expect(FINANCE_SECTIONS.map((section) => section.path)).toEqual([
      "/finance/invoices",
      "/finance/payments",
    ]);
  });

  it("wires finance routes in App.tsx", () => {
    const app = readFileSync(
      path.join(process.cwd(), "src/app/App.tsx"),
      "utf8",
    );
    expect(app).toContain('path="/finance/invoices"');
    expect(app).toContain('path="/finance/invoices/:id"');
    expect(app).toContain('path="/finance/payments"');
    expect(app).toContain("InvoicesPage");
    expect(app).toContain("InvoiceDetailPage");
    expect(app).toContain("PaymentsPage");
  });

  it("derives invoice and payment actions from generated lifecycle metadata", () => {
    const policy = new CommercialLifecyclePolicy();
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
    expect(InvoiceSendLifecycle[0]?.from).toBe("draft");
    expect(PaymentSettleLifecycle.map((t) => t.from)).toEqual(
      expect.arrayContaining(["pending", "processing"]),
    );
  });
});
