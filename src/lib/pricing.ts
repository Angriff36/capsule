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

// Round to 2dp so stored money(12,2) stays stable across compute/store/render.
// ponytail: plain float math is fine for sell-price display values; switch to a
// fixed-point/cents type if this ever feeds a GL accounting ledger.
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

const nonNegative = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

// Amount for a single non-percentage line. `percentage` lines need the running
// subtotal base, so resolve them through computeProposalPricing instead.
export function computeLineAmount(
  line: PricingLineInput,
  guestCount: number,
): number {
  switch (line.pricingBasis) {
    case "per_person":
      return round2(nonNegative(line.unitPrice) * nonNegative(guestCount));
    case "per_unit":
      return round2(
        nonNegative(line.unitPrice) * nonNegative(line.quantity ?? 0),
      );
    case "flat":
    case "package":
      return round2(nonNegative(line.unitPrice));
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
  // lines are taken against.
  const baseSubtotal = input.lines
    .filter((line) => line.pricingBasis !== "percentage")
    .reduce((sum, line) => sum + computeLineAmount(line, guestCount), 0);
  // Pass 2: resolve every line, percentage lines against the base subtotal.
  const lines: PricingLine[] = input.lines.map((line) => {
    if (line.pricingBasis === "percentage") {
      return {
        ...line,
        amount: round2((nonNegative(line.unitPrice) / 100) * baseSubtotal),
      };
    }
    return { ...line, amount: computeLineAmount(line, guestCount) };
  });
  const subtotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
  const discountAmount = round2(nonNegative(input.discountAmount ?? 0));
  const taxAmount = round2(nonNegative(input.taxAmount ?? 0));
  const total = round2(subtotal + taxAmount - discountAmount);
  return { lines, subtotal, discountAmount, taxAmount, total };
}
