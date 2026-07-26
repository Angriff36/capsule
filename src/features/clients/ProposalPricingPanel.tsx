import { useListProposalLineItem } from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import {
  computeProposalPricing,
  PRICING_BASIS_LABELS,
  type PricingBasis,
} from "../../lib/pricing";

interface ProposalPricingPanelProps {
  proposalId: string;
  guestCount: number;
  taxAmount: number;
  discountAmount: number;
}

/**
 * Read-only pricing breakdown for a proposal (spec §5.4). Lists the persisted
 * priced lines and recomputes the totals through the SAME central calc the
 * draft form used (src/lib/pricing.ts), so preview/authoring agree and the
 * accepted revision's numbers stay reproducible. Internal cost/margin are
 * never shown — spec §4.2 keeps those private.
 */
export function ProposalPricingPanel({
  proposalId,
  guestCount,
  taxAmount,
  discountAmount,
}: ProposalPricingPanelProps) {
  const lineItems = useListProposalLineItem();

  if (lineItems === undefined) return <TableSkeleton rows={2} />;

  const rows = (lineItems ?? [])
    .filter((row) => row.deletedAt == null && row.proposalId === proposalId)
    .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder));

  if (rows.length === 0) {
    return (
      <p className="mt-2 text-[13px] text-ink-2">
        No pricing lines on this proposal.
      </p>
    );
  }

  const recomputed = computeProposalPricing({
    lines: rows.map((row) => ({
      pricingBasis: row.pricingBasis as PricingBasis,
      unitPrice: Number(row.unitPrice) || 0,
      quantity: Number(row.quantity) || 0,
    })),
    guestCount,
    discountAmount,
    taxAmount,
  });

  return (
    <div className="rounded-sm border border-line bg-inset p-4">
      <p className="eyebrow">Pricing lines (spec §5.4)</p>
      <p className="mt-1 text-[12px] text-ink-2">
        Totals recomputed by the shared pricing engine — the same path the draft
        form and the published revision use.
      </p>
      <table className="data-table mt-2">
        <thead>
          <tr>
            <th>Description</th>
            <th>Basis</th>
            <th>Price / %</th>
            <th>Qty</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row._id}>
              <td>{row.description}</td>
              <td>{PRICING_BASIS_LABELS[row.pricingBasis as PricingBasis]}</td>
              <td className="tabular-nums">
                {Number(row.unitPrice).toFixed(2)}
              </td>
              <td className="tabular-nums">
                {row.pricingBasis === "per_unit" ? Number(row.quantity) : "—"}
              </td>
              <td className="tabular-nums">
                {(recomputed.lines[index]?.amount ?? 0).toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[13px] text-ink-2">
        Subtotal{" "}
        <span className="tabular-nums">{recomputed.subtotal.toFixed(2)}</span> ·
        Tax{" "}
        <span className="tabular-nums">{recomputed.taxAmount.toFixed(2)}</span>{" "}
        · Discount{" "}
        <span className="tabular-nums">
          {recomputed.discountAmount.toFixed(2)}
        </span>{" "}
        · <span className="font-semibold text-ink">Total </span>
        <span className="tabular-nums font-semibold text-ink">
          {recomputed.total.toFixed(2)}
        </span>
      </p>
    </div>
  );
}
