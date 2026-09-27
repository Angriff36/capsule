import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";
import { LedgerMoney } from "../../src/lib/ledgerMoney";

/**
 * PL-AUTH (AC-372): Proposal.followEventHeadcount moves a draft to the event's
 * guest count. A person may run it from the readiness list, so the money it
 * sends is checked here, inside the same transaction (handleManifestEvent):
 *
 * - a draft with priced lines must carry the central calc's subtotal and total
 *   for the new count (src/lib/pricing.ts, the same calc the reconciliation
 *   seam and the line editors use), with the tax and discount the person set;
 * - a draft with no priced lines keeps its typed money unchanged.
 *
 * Anything else rolls the step back.
 */
export async function assertProposalFollowTotals(
  ctx: MutationCtx,
  proposalId: Id<"proposals">,
  previousTotal: unknown,
): Promise<void> {
  const row = await ctx.db.get(proposalId);
  if (!row || row.deletedAt != null) return;
  const lines = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
      .collect()
  ).filter((line) => line.deletedAt == null && line.tenantId === row.tenantId);

  let matches: boolean;
  if (lines.length === 0) {
    matches = cents(row.total) === cents(previousTotal);
  } else {
    const priced = computeProposalPricing({
      lines: lines.map((line) => ({
        pricingBasis: line.pricingBasis as PricingBasis,
        unitPrice: Number(line.unitPrice) || 0,
        quantity: Number(line.quantity) || 0,
      })),
      guestCount: row.guestCount,
      discountAmount: Number(row.discountAmount) || 0,
      taxAmount: Number(row.taxAmount) || 0,
    });
    matches =
      cents(row.subtotal) === cents(priced.subtotal) &&
      cents(row.total) === cents(priced.total);
  }
  if (!matches) {
    throw new Error(
      "This proposal's price for the new guest count doesn't match its priced lines. Open the proposal again and move it to the event count.",
    );
  }
}

function cents(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? LedgerMoney.fromDollars(parsed).toCents() : NaN;
}
