import { Link } from "react-router-dom";
import { useProposalLineItems } from "../../lib/financeScopedQueries";
import {
  byLineDisplayOrder,
  computeProposalPricing,
  PRICING_BASIS_LABELS,
  type PricingBasis,
} from "../../lib/pricing";
import { EmptyState } from "../../ui/primitives";
import { CLIENTS_ROUTES } from "../clients/clientsRoutes";

/**
 * A bill with no lines of its own that was made from an accepted proposal:
 * it is one amount as the client signed it (the proposal showed its own
 * tax, so the workspace's tax is not added). Its make-up is the proposal's
 * priced lines at the event's guest count; they are shown when they add up
 * to the bill's subtotal. Otherwise the plain no-lines note.
 */
export function InvoiceSignedProposalLines({
  proposalId,
  guestCount,
  subtotal,
  usd,
}: {
  proposalId: string;
  guestCount: number | null | undefined;
  subtotal: number;
  usd: (value: unknown) => string;
}) {
  const rows = useProposalLineItems(proposalId);
  if (rows === undefined) return null;
  const lines = rows
    .filter((row) => row.deletedAt == null && row.removedAt == null)
    .sort(byLineDisplayOrder);
  const priced = computeProposalPricing({
    lines: lines.map((row) => ({
      pricingBasis: row.pricingBasis as PricingBasis,
      unitPrice: Number(row.unitPrice) || 0,
      quantity: Number(row.quantity) || 0,
    })),
    guestCount: Number(guestCount ?? 0),
  });
  const proposalLink = (
    <Link className="text-link" to={CLIENTS_ROUTES.proposal(proposalId)}>
      Open the proposal
    </Link>
  );
  if (
    lines.length === 0 ||
    Math.round(priced.subtotal * 100) !== Math.round(subtotal * 100)
  ) {
    return (
      <EmptyState
        title="Billed as one amount from the accepted proposal."
        hint="The amount the client signed. Its subtotal and tax are below."
        action={proposalLink}
      />
    );
  }
  return (
    <div className="supply-table-wrap">
      <p className="text-sm text-ink-3">
        Billed as one amount, as the client signed it, from the accepted
        proposal's prices at {Number(guestCount)} guests. {proposalLink}
      </p>
      <table className="supply-table invoice-detail-lines">
        <thead>
          <tr>
            <th>Description</th>
            <th>Priced</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((row, index) => {
            const basis = row.pricingBasis as PricingBasis;
            return (
              <tr key={row._id}>
                <td>{row.description}</td>
                <td>{PRICING_BASIS_LABELS[basis] ?? basis}</td>
                <td>
                  {basis === "per_person"
                    ? Number(guestCount)
                    : basis === "per_unit"
                      ? Number(row.quantity)
                      : 1}
                </td>
                <td>
                  {basis === "percentage"
                    ? `${Number(row.unitPrice)}%`
                    : usd(row.unitPrice)}
                </td>
                <td>{usd(priced.lines[index].amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
