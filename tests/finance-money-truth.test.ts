import { describe, expect, it } from "vitest";
import {
  BILLED_INVOICE_STATUSES,
  isBilledInvoice,
  isDraftInvoice,
  rollupEventBilling,
} from "../src/features/finance/invoiceBilling";
import { buildRevenueTrend } from "../src/features/finance/revenueTrend";
import {
  buildEventCostSummary,
  isUnreconciledCloseout,
} from "../src/features/finance/eventCostSummary";
import { buildLiveEventProfitability } from "../src/features/events/liveEventProfitability";

// The prod lie behind PR #170: /finance/revenue reported $19.8K over
// "6 issued invoices" while the invoice ledger held 4 DRAFTs totaling
// $4,500. issue() stamps issuedAt while the invoice is still an unsent
// draft, so "issuedAt != null" (or "not voided/written_off") must never
// be the revenue test — billed means sent/viewed/overdue/partial/paid.

const NOW = new Date("2026-08-19T12:00:00Z");
const ISSUED = NOW.getTime() - 24 * 60 * 60 * 1000;

const invoice = (overrides: Record<string, unknown>) => ({
  _id: `inv-${Math.random().toString(36).slice(2)}`,
  clientId: "client-1",
  eventId: "event-1",
  total: 3600,
  issuedAt: ISSUED,
  createdAt: ISSUED,
  ...overrides,
});

describe("isBilledInvoice — billed means sent through paid, never drafts", () => {
  it("rejects a draft even when issuedAt is stamped (the $19.8K lie)", () => {
    expect(isBilledInvoice(invoice({ status: "draft" }))).toBe(false);
  });

  it("rejects voided, written-off, and deleted invoices", () => {
    expect(isBilledInvoice(invoice({ status: "voided" }))).toBe(false);
    expect(isBilledInvoice(invoice({ status: "written_off" }))).toBe(false);
    expect(
      isBilledInvoice(invoice({ status: "sent", deletedAt: NOW.getTime() })),
    ).toBe(false);
  });

  it("accepts every billed status", () => {
    for (const status of BILLED_INVOICE_STATUSES) {
      expect(isBilledInvoice(invoice({ status }))).toBe(true);
    }
    // Guards against re-widening to "anything not voided/written_off":
    // the billed set is exactly these five statuses.
    expect([...BILLED_INVOICE_STATUSES].sort()).toEqual(
      ["overdue", "paid", "partial", "sent", "viewed"].sort(),
    );
  });

  it("treats live drafts as drafts, not deleted ones", () => {
    expect(isDraftInvoice(invoice({ status: "draft" }))).toBe(true);
    expect(
      isDraftInvoice(invoice({ status: "draft", deletedAt: NOW.getTime() })),
    ).toBe(false);
  });
});

describe("buildRevenueTrend — drafts never appear as billed revenue", () => {
  const trendFor = (invoices: Record<string, unknown>[]) =>
    buildRevenueTrend({
      invoices,
      clients: [],
      events: [],
      venues: [],
      granularity: "month",
      breakdown: "event_type",
      now: NOW,
    });

  it("counts $0 / 0 invoices when only drafts exist, even with issuedAt", () => {
    const trend = trendFor([
      invoice({ status: "draft", total: 3600 }),
      invoice({ status: "draft", total: 900, issuedAt: null }),
    ]);
    expect(trend.currentTotal).toBe(0);
    expect(trend.currentInvoiceCount).toBe(0);
  });

  it("counts sent and paid invoices, excludes voided/written_off/deleted", () => {
    const trend = trendFor([
      invoice({ status: "sent", total: 3600 }),
      invoice({ status: "paid", total: 7200 }),
      invoice({ status: "voided", total: 1000 }),
      invoice({ status: "written_off", total: 1000 }),
      invoice({ status: "sent", total: 1000, deletedAt: NOW.getTime() }),
      invoice({ status: "draft", total: 4500 }),
    ]);
    expect(trend.currentTotal).toBe(10800);
    expect(trend.currentInvoiceCount).toBe(2);
  });
});

describe("buildLiveEventProfitability — confirmed revenue follows billing", () => {
  const profitabilityFor = (invoices: Record<string, unknown>[]) =>
    buildLiveEventProfitability({
      eventId: "event-1",
      invoices,
      demands: [],
      orders: [],
      lines: [],
      lineDemands: [],
      payrollInputs: [],
      equipment: [],
      equipmentReservations: [],
    });

  it("a draft with issuedAt and total 3600 confirms $0; sending confirms 3600", () => {
    const draft = invoice({ status: "draft", total: 3600 });
    expect(profitabilityFor([draft]).confirmedRevenue).toBe(0);
    expect(profitabilityFor([draft]).invoiceCount).toBe(0);

    const sent = { ...draft, status: "sent" };
    expect(profitabilityFor([sent]).confirmedRevenue).toBe(3600);
    expect(profitabilityFor([sent]).invoiceCount).toBe(1);
  });

  it("excludes voided, written_off, and deleted invoices", () => {
    expect(
      profitabilityFor([
        invoice({ status: "voided" }),
        invoice({ status: "written_off" }),
        invoice({ status: "sent", deletedAt: NOW.getTime() }),
      ]).confirmedRevenue,
    ).toBe(0);
  });
});

describe("buildEventCostSummary — folio separates billed, collected, drafts", () => {
  const event = {
    _id: "event-1",
    title: "E2E Holiday Dinner",
    expectedHeadcount: 24,
  };
  const seededCloseout = {
    eventId: "event-1",
    status: "draft",
    actualRevenue: 0,
    actualHeadcount: 0,
    expectedHeadcount: 0,
  };

  it("keeps drafts out of billed revenue and reports them separately", () => {
    const summary = buildEventCostSummary({
      event,
      closeout: seededCloseout,
      invoices: [
        invoice({ status: "draft", total: 3600 }),
        invoice({ status: "sent", total: 1200, amountPaid: 200 }),
      ],
    });
    expect(summary.invoicedRevenue).toBe(1200);
    expect(summary.invoiceCount).toBe(1);
    expect(summary.draftInvoiceTotal).toBe(3600);
    expect(summary.draftInvoiceCount).toBe(1);
    expect(summary.collectedTotal).toBe(200);
  });

  it("never sells seeded $0 costs as a reconciled 100% margin (QA Gallery)", () => {
    // Prod repro: Invoiced $7,200 vs cascade-seeded $0 costs printed
    // "Total event cost $0.00 · reconciled closeout" and "+100% of revenue".
    const summary = buildEventCostSummary({
      event,
      closeout: seededCloseout,
      invoices: [invoice({ status: "paid", total: 7200, amountPaid: 7200 })],
    });
    expect(summary.invoicedRevenue).toBe(7200);
    expect(summary.totalCost).toBe(0);
    expect(summary.costsPending).toBe(true);
    expect(summary.marginPercent).toBeNull();
    for (const bucket of summary.buckets) {
      expect(bucket.source).toContain("awaiting reconciliation");
      expect(bucket.source).not.toContain("reconciled at closeout");
    }
  });

  it("clears costsPending once the closeout carries reconciled numbers", () => {
    const reconciled = buildEventCostSummary({
      event,
      closeout: {
        eventId: "event-1",
        status: "finalized",
        actualRevenue: 7200,
        actualIngredientCost: 1800,
        actualLaborCost: 2400,
      },
      invoices: [invoice({ status: "paid", total: 7200, amountPaid: 7200 })],
    });
    expect(reconciled.costsPending).toBe(false);
    expect(reconciled.totalCost).toBe(4200);
    expect(reconciled.marginPercent).toBeCloseTo((3000 / 7200) * 100);
  });

  it("flags cascade-seeded zero closeouts as unreconciled with real headcount", () => {
    const summary = buildEventCostSummary({
      event,
      closeout: seededCloseout,
      invoices: [],
    });
    expect(summary.unreconciled).toBe(true);
    expect(summary.headcount.expected).toBe(24);
  });

  it("treats reconciled revenue as fact once captured", () => {
    expect(
      isUnreconciledCloseout({ status: "draft", actualRevenue: 3600 }),
    ).toBe(false);
    expect(
      isUnreconciledCloseout({ status: "finalized", actualRevenue: 0 }),
    ).toBe(false);
    expect(isUnreconciledCloseout({ status: "draft", actualRevenue: 0 })).toBe(
      true,
    );
  });
});

describe("rollupEventBilling — closeout row truth", () => {
  it("splits an event's invoices into billed / collected / drafted", () => {
    const rollup = rollupEventBilling(
      [
        invoice({ status: "sent", total: 1200, amountPaid: 200 }),
        invoice({ status: "paid", total: 800, amountPaid: 800 }),
        invoice({ status: "draft", total: 3600 }),
        invoice({ status: "voided", total: 500 }),
        invoice({ status: "sent", total: 999, eventId: "other-event" }),
      ],
      "event-1",
    );
    expect(rollup).toEqual({
      billedTotal: 2000,
      billedCount: 2,
      collectedTotal: 1000,
      draftTotal: 3600,
      draftCount: 1,
    });
  });
});
