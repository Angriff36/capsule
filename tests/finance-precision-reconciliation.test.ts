import { describe, expect, it } from "vitest";

import { LedgerMoney, roundMoney } from "../src/lib/ledgerMoney";
import { InvoiceMoneyLedger } from "../src/lib/invoiceMoneyLedger";
import { computeProposalPricing } from "../src/lib/pricing";
import { calculateInvoiceTax } from "../src/features/finance/invoiceTax";
import { rollupEventBilling } from "../src/features/finance/invoiceBilling";

const toCents = (dollars: number) => LedgerMoney.fromDollars(dollars).toCents();

describe("finance precision reconciliation", () => {
  it("per_person, per_unit, flat, percentage, and package each produce a client amount", () => {
    const result = computeProposalPricing({
      guestCount: 10,
      lines: [
        { pricingBasis: "per_person", unitPrice: 12.5 },
        { pricingBasis: "per_unit", unitPrice: 4.0, quantity: 3 },
        { pricingBasis: "flat", unitPrice: 75 },
        { pricingBasis: "package", unitPrice: 200 },
        { pricingBasis: "percentage", unitPrice: 10 },
      ],
    });

    expect(result.lines[0]!.amount).toBe(125);
    expect(result.lines[1]!.amount).toBe(12);
    expect(result.lines[2]!.amount).toBe(75);
    expect(result.lines[3]!.amount).toBe(200);
    // 10% of the 412 base subtotal (125 + 12 + 75 + 200).
    expect(result.lines[4]!.amount).toBe(41.2);
    expect(result.subtotal).toBe(453.2);

    for (const key of [
      "cost",
      "foodCost",
      "margin",
      "vendorCost",
      "internalCost",
    ]) {
      expect(Object.keys(result)).not.toContain(key);
      expect(Object.keys(result.lines[0]!)).not.toContain(key);
    }
  });

  it("line cents plus tax minus discount equal the proposal total", () => {
    const result = computeProposalPricing({
      guestCount: 1,
      lines: [
        { pricingBasis: "per_unit", unitPrice: 0.1, quantity: 3 },
        { pricingBasis: "per_unit", unitPrice: 0.2, quantity: 3 },
      ],
      taxAmount: 0.07,
      discountAmount: 0.05,
    });

    const lineCents = result.lines.map((line) => toCents(line.amount));
    const subtotalCents = toCents(result.subtotal);
    const taxCents = toCents(result.taxAmount);
    const discountCents = toCents(result.discountAmount);
    const totalCents = toCents(result.total);

    expect(lineCents.reduce((sum, cents) => sum + cents, 0)).toBe(
      subtotalCents,
    );
    expect(subtotalCents + taxCents - discountCents).toBe(totalCents);
    expect(subtotalCents).toBe(90);
    expect(totalCents).toBe(92);
  });

  it("invoice tax line cents plus tax cents equal the invoice total", () => {
    const result = calculateInvoiceTax(
      [
        {
          id: "line-1",
          description: "Food line",
          category: "food",
          quantity: 3,
          unitPrice: 10.1,
        },
        {
          id: "line-2",
          description: "Service line",
          category: "service",
          quantity: 1,
          unitPrice: 0.1,
        },
      ],
      [
        {
          _id: "rate-1",
          name: "Sales tax",
          percentage: 8.25,
          appliesToFood: true,
          appliesToService: false,
          appliesToRental: false,
          active: true,
        },
      ],
    );

    const subtotalCents = result.lineItems.map((line) =>
      toCents(line.subtotal),
    );
    const taxCents = result.lineItems.map((line) => toCents(line.taxAmount));
    const totalCents = result.lineItems.map((line) => toCents(line.total));

    // 3 × $10.10 = $30.30; 8.25% rounds to $2.50; service line untaxed.
    expect(subtotalCents).toEqual([3030, 10]);
    expect(taxCents).toEqual([250, 0]);
    expect(totalCents).toEqual([3280, 10]);

    expect(subtotalCents.reduce((sum, cents) => sum + cents, 0)).toBe(
      toCents(result.subtotal),
    );
    expect(taxCents.reduce((sum, cents) => sum + cents, 0)).toBe(
      toCents(result.taxAmount),
    );
    expect(toCents(result.subtotal) + toCents(result.taxAmount)).toBe(
      toCents(result.total),
    );
  });

  it("fromDollars then toDollars is stable at two decimals", () => {
    expect(LedgerMoney.fromDollars(19.99).toDollars()).toBe(19.99);
    expect(
      LedgerMoney.fromDollars(0.1).add(LedgerMoney.fromDollars(0.2)).toCents(),
    ).toBe(30);
    // 1.005 × 100 = 100.49999999999999 → Math.round lands on 100 cents.
    expect(roundMoney(1.005)).toBe(1);
    expect(toCents(1.005)).toBe(100);
  });

  it("statement charges minus payments minus credits equal due to the cent", () => {
    const ledger = new InvoiceMoneyLedger();

    expect(ledger.statementDue(100.1, 40.03, 10.02)).toBe(50.05);
    // 1000 − 100 − 900 nets to zero exactly, not a float whisper.
    expect(ledger.statementDue(1000, 100, 900)).toBe(0);
    // Overpay / overcredit stays exact — never clamped positive.
    expect(ledger.statementDue(100, 100, 40)).toBe(-40);
    // 0.1 + 0.2 float residue never reaches the statement line.
    expect(ledger.statementDue(0.3, 0.1, 0.2)).toBe(0);
    expect(toCents(ledger.statementDue(0.1, 0, 0))).toBe(10);
    expect(ledger.statementDue(59.99, 0)).toBe(59.99);
  });

  it("payment allocations close invoices to the cent and keep remainder", () => {
    const ledger = new InvoiceMoneyLedger();

    const first = ledger.allocateAcross([1000], 100);
    expect(first).toEqual({ applied: [100], remainder: 0 });
    const second = ledger.allocateAcross([900], 900);
    expect(second).toEqual({ applied: [900], remainder: 0 });
    expect(1000 - 100 - 900).toBe(0);

    const partial = ledger.allocateAcross([10.1, 20.2, 0.05], 30.4);
    expect(partial.applied).toEqual([10.1, 20.2, 0.05]);
    expect(partial.remainder).toBe(0.05);

    const exact = ledger.allocateAcross([0.1, 0.2], 0.3);
    expect(exact.applied).toEqual([0.1, 0.2]);
    expect(exact.remainder).toBe(0);
    // Every leftover due is exactly zero cents after the waterfall.
    expect(toCents(exact.applied[0]) + toCents(exact.applied[1])).toBe(30);

    const single = ledger.applyPayment(0.1, 0.3);
    expect(single.applied).toBe(0.1);
    expect(single.nextDue).toBe(0);
    expect(single.remainder).toBe(0.2);
  });

  it("aging bucket cents sum to the outstanding total", () => {
    const ledger = new InvoiceMoneyLedger();
    const asOf = Date.UTC(2026, 8, 22);
    const day = 86_400_000;

    const totals = ledger.ageOpenBalances(
      [
        { amountDue: 10.1, dueDate: null },
        { amountDue: 20.2, dueDate: asOf - 10 * day },
        { amountDue: 0.05, dueDate: asOf - 40 * day },
        { amountDue: 1.01, dueDate: asOf - 90 * day },
      ],
      asOf,
    );

    expect(totals.current).toBe(10.1);
    expect(totals.days1to30).toBe(20.2);
    expect(totals.days31to60).toBe(0.05);
    expect(totals.days61plus).toBe(1.01);
    expect(totals.outstanding).toBe(31.36);
    expect(totals.overdue).toBe(21.26);

    const bucketCents =
      toCents(totals.current) +
      toCents(totals.days1to30) +
      toCents(totals.days31to60) +
      toCents(totals.days61plus);
    expect(bucketCents).toBe(toCents(totals.outstanding));
    expect(toCents(totals.overdue)).toBe(
      toCents(totals.days1to30) +
        toCents(totals.days31to60) +
        toCents(totals.days61plus),
    );
  });

  it("reporting rollup billed cents equal invoice cents", () => {
    const invoice = (eventId: string, status: string, total: number) => ({
      eventId,
      status,
      total,
      amountPaid: 0,
    });
    const invoices = [
      { ...invoice("e1", "sent", 10.1), amountPaid: 10.1 },
      invoice("e1", "paid", 20.2),
      invoice("e1", "partial", 0.05),
      invoice("e1", "draft", 99.99),
      invoice("e2", "sent", 5.55),
    ];

    const rollup = rollupEventBilling(invoices, "e1");

    expect(rollup.billedTotal).toBe(30.35);
    expect(rollup.collectedTotal).toBe(10.1);
    expect(rollup.billedCount).toBe(3);
    expect(toCents(rollup.billedTotal)).toBe(
      toCents(10.1) + toCents(20.2) + toCents(0.05),
    );
  });
});
