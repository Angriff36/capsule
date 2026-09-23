import { describe, expect, it } from "vitest";

import { LedgerMoney, roundMoney } from "../src/lib/ledgerMoney";
import { computeProposalPricing } from "../src/lib/pricing";
import { calculateInvoiceTax } from "../src/features/finance/invoiceTax";

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
});
