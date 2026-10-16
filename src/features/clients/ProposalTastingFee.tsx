import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";
import { useProposalLineItems } from "../../lib/financeScopedQueries";
import { formatMoneyExact } from "../../lib/format";
import { computeLineAmount, type PricingBasis } from "../../lib/pricing";
import {
  countsTowardMinimum,
  isTastingLine,
  TASTING_LINE_DESCRIPTION,
  tastingFeeFor,
} from "../../lib/pricingRules";
import { usePricingRules } from "../../lib/usePricingRules";
import { useProposalTastings } from "../../lib/useTastings";

/**
 * The company's tasting fee next to a draft proposal's lines
 * (src/lib/pricingRules.ts): the booked tasting's guests at the per-guest
 * fee, up to the company's limit, free once food and drink reach the
 * company's amount. One tap adds, updates or removes the "Tasting" line.
 */
export function ProposalTastingFee({
  proposalId,
  guestCount,
  onFailure,
}: {
  proposalId: string;
  guestCount: number;
  onFailure?: (error: Error) => void;
}) {
  const rules = usePricingRules();
  const lineItems = useProposalLineItems(proposalId);
  const tastings = useProposalTastings(proposalId);
  const addLine = useMutation(
    api.lib.proposalPricing.addProposalLineAndRecompute,
  );
  const reviseLine = useMutation(
    api.lib.proposalPricing.reviseProposalLineAndRecompute,
  );
  const removeLine = useMutation(
    api.lib.proposalPricing.removeProposalLineAndRecompute,
  );
  const [busy, setBusy] = useState(false);
  if (!rules || !lineItems || !tastings || !(rules.tasting.perGuest > 0))
    return null;
  const tasting = tastings.find((row) => String(row.status) !== "cancelled");
  const lines = lineItems.filter((line) => line.deletedAt == null);
  const tastingLine = lines.find(isTastingLine);
  if (!tasting && !tastingLine) return null;

  const tastingGuests = tasting ? Number(tasting.guestCount) : 0;
  const foodTotal =
    lines.filter(countsTowardMinimum).reduce(
      (sum, line) =>
        sum +
        Math.round(
          computeLineAmount(
            {
              pricingBasis: String(line.pricingBasis) as PricingBasis,
              unitPrice: Number(line.unitPrice),
              quantity: Number(line.quantity),
            },
            guestCount,
          ) * 100,
        ),
      0,
    ) / 100;
  const fee = tastingFeeFor(rules, tastingGuests, foodTotal);
  const charged = Math.min(
    tastingGuests,
    rules.tasting.maxGuests || tastingGuests,
  );
  const description = `${TASTING_LINE_DESCRIPTION} (${charged} guest${charged === 1 ? "" : "s"})`;
  const inStep =
    (fee === 0 && !tastingLine) ||
    (fee > 0 &&
      Number(tastingLine?.unitPrice) === fee &&
      tastingLine?.description === description);

  const apply = () => {
    setBusy(true);
    const work =
      fee === 0 && tastingLine
        ? removeLine({
            docId: tastingLine._id,
            version: Number(tastingLine.version),
          })
        : tastingLine
          ? reviseLine({
              docId: tastingLine._id,
              version: Number(tastingLine.version),
              description,
              pricingBasis: "flat",
              unitPrice: fee,
              quantity: 1,
              sortOrder: Number(tastingLine.sortOrder),
              notes: tastingLine.notes ?? undefined,
            })
          : addLine({
              proposalId: proposalId as Id<"proposals">,
              description,
              pricingBasis: "flat",
              unitPrice: fee,
              sortOrder:
                lines.reduce(
                  (max, row) => Math.max(max, Number(row.sortOrder) || 0),
                  -1,
                ) + 1,
            });
    work
      .catch((error: unknown) =>
        onFailure?.(error instanceof Error ? error : new Error(String(error))),
      )
      .finally(() => setBusy(false));
  };

  const freeNote =
    rules.tasting.freeAt > 0
      ? ` Free from ${formatMoneyExact(rules.tasting.freeAt)} of food and drink.`
      : "";

  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-2 text-base text-ink-2"
      data-testid="proposal-tasting-fee"
    >
      <span>
        {tasting
          ? fee > 0
            ? `Tasting fee: ${formatMoneyExact(fee)} for ${charged} guest${charged === 1 ? "" : "s"}.`
            : "Tasting: free for this booking."
          : "No tasting is booked for this proposal now."}
        {freeNote}
      </span>
      {!inStep ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={apply}
        >
          {fee === 0
            ? "Remove the tasting line"
            : tastingLine
              ? `Update the tasting line to ${formatMoneyExact(fee)}`
              : `Add ${formatMoneyExact(fee)} tasting fee`}
        </button>
      ) : null}
    </p>
  );
}
