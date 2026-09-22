/**
 * The commercial seed the Event itself owns: the quoted price the operator
 * stored on the Event at booking (via planEngagement or changePricing). A
 * later Proposal total must NOT rewrite or stand in for it — a missing Event
 * seed stays missing (null), never falls back to the live proposal total.
 * Billing still uses the accepted proposal revision; this seed is only what
 * the Event overview and budget card print.
 */
export function eventCommercialQuotedPrice(input: {
  quotedPrice?: number | null;
  liveProposalTotal?: number | null;
}): number | null {
  if (
    typeof input.quotedPrice === "number" &&
    Number.isFinite(input.quotedPrice)
  ) {
    return input.quotedPrice;
  }
  return null;
}
