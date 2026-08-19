import { describe, expect, it } from "vitest";
import {
  BILLED_INVOICE_STATUSES,
  isBilledInvoice,
  isDraftInvoice,
  rollupEventBilling,
} from "../src/features/finance/invoiceBilling";
import { buildRevenueTrend } from "../src/features/finance/revenueTrend";
import { readFileSync } from "node:fs";
import {
  buildEventCostSummary,
  closeoutListedCost,
  isCloseoutListProfitPending,
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

  it("treats every draft closeout as unreconciled, even after billed revenue is captured", () => {
    // Capture-prefill writes actualRevenue from billedTotal while costs
    // stay $0. Revenue on a draft is not reconciliation — finalize is.
    expect(
      isUnreconciledCloseout({ status: "draft", actualRevenue: 7200 }),
    ).toBe(true);
    expect(isUnreconciledCloseout({ status: "draft", actualRevenue: 0 })).toBe(
      true,
    );
    expect(
      isUnreconciledCloseout({ status: "finalized", actualRevenue: 0 }),
    ).toBe(false);
    expect(
      isUnreconciledCloseout({ status: "finalized", actualRevenue: 7200 }),
    ).toBe(false);
  });

  it("billed-prefill + $0 costs stays costsPending (capture save path)", () => {
    const summary = buildEventCostSummary({
      event,
      closeout: {
        eventId: "event-1",
        status: "draft",
        actualRevenue: 7200,
        actualIngredientCost: 0,
        actualLaborCost: 0,
        actualVendorCost: 0,
        actualWasteCost: 0,
      },
      invoices: [invoice({ status: "paid", total: 7200, amountPaid: 7200 })],
    });
    expect(summary.unreconciled).toBe(true);
    expect(summary.costsPending).toBe(true);
    expect(summary.totalCost).toBe(0);
    expect(summary.invoicedRevenue).toBe(7200);
    expect(summary.marginPercent).toBeNull();
    for (const bucket of summary.buckets) {
      expect(bucket.source).toContain("awaiting reconciliation");
      expect(bucket.source).not.toContain("reconciled at closeout");
    }
  });

  it("list Gross profit hides draft+$0 costs even when capture stored $7,200 profit", () => {
    // Capture payload: grossProfit = actualRevenue - totalActualCost.
    // Draft + billed $7200 + $0 costs → grossProfit 7200. Hiding only
    // when grossProfit===0 would print $7,200.00 as list fact.
    const captureSave = {
      status: "draft",
      actualRevenue: 7200,
      totalActualCost: 0,
      actualIngredientCost: 0,
      actualLaborCost: 0,
      actualVendorCost: 0,
      actualWasteCost: 0,
      grossProfit: 7200,
    };
    expect(isCloseoutListProfitPending(captureSave)).toBe(true);
    const invertedGrossProfitZeroOnly =
      isUnreconciledCloseout(captureSave) &&
      Number(captureSave.grossProfit ?? 0) === 0;
    expect(invertedGrossProfitZeroOnly).toBe(false);
    expect(isCloseoutListProfitPending(captureSave)).not.toBe(
      invertedGrossProfitZeroOnly,
    );

    // Draft + real costs can still show the draft number.
    expect(
      isCloseoutListProfitPending({
        status: "draft",
        actualRevenue: 7200,
        totalActualCost: 1800,
        actualIngredientCost: 1800,
        grossProfit: 5400,
      }),
    ).toBe(false);

    // Finalize still computes.
    expect(
      isCloseoutListProfitPending({
        status: "finalized",
        actualRevenue: 7200,
        totalActualCost: 4200,
        actualIngredientCost: 1800,
        actualLaborCost: 2400,
        grossProfit: 3000,
      }),
    ).toBe(false);
  });

  it("folio invoice numbers use the same formatter as the invoices list", () => {
    // QA 170 residual: folio named billed INV-2026-QA1 while the invoices
    // list showed the $3,600 draft as INV-8BJQS7. Folio printed raw
    // invoiceNumber; the list runs formatInvoiceNumber(_id).
    const billed = invoice({
      _id: "jx7humanbilledid0000000000001",
      status: "sent",
      invoiceNumber: "INV-2026-QA1",
      total: 3600,
    });
    const draftId = "m97draftxxxxxxxxxxxxxxxx8bjqs7";
    const eventDocId = "k57eventidxxxxxxxxxxxxxxxxqa1xx";
    const draft = invoice({
      _id: draftId,
      status: "draft",
      invoiceNumber: eventDocId,
      total: 3600,
    });
    const summary = buildEventCostSummary({
      event,
      closeout: seededCloseout,
      invoices: [billed, draft],
    });
    expect(summary.invoiceNumbers).toEqual(["INV-2026-QA1"]);
    expect(summary.draftInvoiceNumbers).toEqual(["INV-8BJQS7"]);
    expect(summary.invoiceNumbers).not.toContain(eventDocId);
    expect(summary.draftInvoiceNumbers).not.toContain(eventDocId);
  });

  it("formats a billed cascade-seeded eventId as INV- from the invoice _id", () => {
    const invId = "n12billedxxxxxxxxxxxxxxxxabcd12";
    const eventDocId = "k57eventxxxxxxxxxxxxxxxxxxzzzzzz";
    const summary = buildEventCostSummary({
      event,
      closeout: seededCloseout,
      invoices: [
        invoice({
          _id: invId,
          status: "sent",
          invoiceNumber: eventDocId,
          total: 1200,
        }),
      ],
    });
    expect(summary.invoiceNumbers).toEqual(["INV-ABCD12"]);
    expect(summary.invoiceNumbers[0]).not.toBe(eventDocId);
  });

  it("list Cost column hides draft+$0 costs the same way Gross profit does", () => {
    const pending = {
      status: "draft",
      actualRevenue: 3600,
      totalActualCost: 0,
      actualIngredientCost: 0,
      actualLaborCost: 0,
      actualVendorCost: 0,
      actualWasteCost: 0,
      grossProfit: 3600,
    };
    expect(closeoutListedCost(pending)).toBeNull();
    expect(
      closeoutListedCost({
        status: "draft",
        actualRevenue: 3600,
        totalActualCost: 1800,
        actualIngredientCost: 1800,
        grossProfit: 1800,
      }),
    ).toBe(1800);
    expect(
      closeoutListedCost({
        status: "finalized",
        actualRevenue: 3600,
        totalActualCost: 1800,
        actualIngredientCost: 1800,
        grossProfit: 1800,
      }),
    ).toBe(1800);
  });

  it("CloseoutPage Gross profit cell uses costsPending, not grossProfit===0", () => {
    const page = readFileSync("src/features/finance/CloseoutPage.tsx", "utf8");
    expect(page).toContain("isCloseoutListProfitPending");
    expect(page).not.toContain(
      "unreconciled && Number(row.grossProfit ?? 0) === 0",
    );
    expect(page).toContain("<th>Billed</th>");
    expect(page).toContain("<th>Cost</th>");
    expect(page).toContain("closeoutListedCost");
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
