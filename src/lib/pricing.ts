// Central proposal-pricing calculation — spec §5.4.
//
// "Line items support the pricing bases Capsule already needs—per person,
// quantity/unit, flat fee, percentage, or package—without mixing internal
// cost into client-facing totals. ... Discounts, service charges, taxability,
// and deposits use ONE central calculation path shared by preview,
// publication, acceptance, PDF/render, and reporting."
//
// This module is that one path. The proposal draft form calls it to derive the
// four stored totals (subtotal/taxAmount/discountAmount/total) from the line
// items; the revision snapshot captures those same line items at publication;
// every read surface (PDF, acceptance, portal) consumes the stored/snapshotted
// values the central calc produced. There is no second arithmetic path.
//
// Internal food cost / vendor cost / margin are deliberately NOT handled here
// — spec §4.2 keeps those private; they live only in finance/kitchen reports.

import { LedgerMoney } from "./ledgerMoney";

export type PricingBasis =
  | "per_person" // unitPrice × guestCount
  | "per_unit" // unitPrice × quantity
  | "flat" // unitPrice (one-time fee)
  | "percentage" // unitPrice is a percent (0-100) of the pre-fee subtotal
  | "package"; // unitPrice for the whole package (flat, named for clarity)

// All pricing bases the UI offers, in display order.
export const PRICING_BASES: PricingBasis[] = [
  "per_person",
  "per_unit",
  "flat",
  "percentage",
  "package",
];

export const PRICING_BASIS_LABELS: Record<PricingBasis, string> = {
  per_person: "Per person",
  per_unit: "Per unit",
  flat: "Flat fee",
  percentage: "Percentage",
  package: "Package",
};

export interface PricingLineInput {
  pricingBasis: PricingBasis;
  /** Sell price the client sees. For `percentage` this is a percent 0-100. */
  unitPrice: number;
  /** Required for `per_unit`; ignored by the other bases. */
  quantity?: number;
}

export interface PricingLine extends PricingLineInput {
  /** Central-calc-computed line amount (percentage resolved against the base). */
  amount: number;
}

export interface ProposalPricingInput {
  lines: PricingLineInput[];
  guestCount: number;
  discountAmount?: number;
  taxAmount?: number;
}

export interface ProposalPricing {
  /** Lines with their resolved amounts (percentage lines resolved). */
  lines: PricingLine[];
  /** Sum of every line amount (base + percentage fees). */
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  /** subtotal + taxAmount - discountAmount (matches the Proposal invariant). */
  total: number;
}

const nonNegative = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

// Amount for a single non-percentage line. `percentage` lines need the running
// subtotal base, so resolve them through computeProposalPricing instead.
export function computeLineAmount(
  line: PricingLineInput,
  guestCount: number,
): number {
  switch (line.pricingBasis) {
    case "per_person":
      return LedgerMoney.fromDollars(nonNegative(line.unitPrice))
        .times(nonNegative(guestCount))
        .toDollars();
    case "per_unit":
      return LedgerMoney.fromDollars(nonNegative(line.unitPrice))
        .times(nonNegative(line.quantity ?? 0))
        .toDollars();
    case "flat":
    case "package":
      return LedgerMoney.fromDollars(nonNegative(line.unitPrice)).toDollars();
    case "percentage":
      // Resolved in computeProposalPricing against the base subtotal.
      return 0;
    default:
      return 0;
  }
}

export function computeProposalPricing(
  input: ProposalPricingInput,
): ProposalPricing {
  const guestCount = nonNegative(input.guestCount);
  // Pass 1: base (non-percentage) lines — these define the subtotal percentage
  // lines are taken against. Combined in integer cents.
  const baseCents = input.lines
    .filter((line) => line.pricingBasis !== "percentage")
    .reduce(
      (sum, line) =>
        sum +
        LedgerMoney.fromDollars(computeLineAmount(line, guestCount)).toCents(),
      0,
    );
  // Pass 2: resolve every line, percentage lines against the base subtotal.
  const lines: PricingLine[] = input.lines.map((line) => {
    if (line.pricingBasis === "percentage") {
      return {
        ...line,
        amount: LedgerMoney.fromCents(baseCents)
          .percent(nonNegative(line.unitPrice))
          .toDollars(),
      };
    }
    return { ...line, amount: computeLineAmount(line, guestCount) };
  });
  const subtotalCents = lines.reduce(
    (sum, line) => sum + LedgerMoney.fromDollars(line.amount).toCents(),
    0,
  );
  const subtotal = LedgerMoney.fromCents(subtotalCents).toDollars();
  const discountAmount = LedgerMoney.fromDollars(
    nonNegative(input.discountAmount ?? 0),
  ).toDollars();
  const taxAmount = LedgerMoney.fromDollars(
    nonNegative(input.taxAmount ?? 0),
  ).toDollars();
  const total = LedgerMoney.fromCents(subtotalCents)
    .add(LedgerMoney.fromDollars(taxAmount))
    .subtract(LedgerMoney.fromDollars(discountAmount))
    .toDollars();
  return { lines, subtotal, discountAmount, taxAmount, total };
}
