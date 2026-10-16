import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";
import { useProposalLineItems } from "../../lib/financeScopedQueries";
import { formatMoneyExact } from "../../lib/format";
import { computeLineAmount, type PricingBasis } from "../../lib/pricing";
import {
  cateringMinimumFor,
  countsTowardMinimum,
  hasCateringMinimums,
  isFarAway,
  isMinimumLine,
  MINIMUM_LINE_DESCRIPTION,
} from "../../lib/pricingRules";
import { usePricingRules } from "../../lib/usePricingRules";
import { useProposalTravelFee } from "../../lib/useTravelFee";

/**
 * The company's catering minimum next to a draft proposal's lines
 * (src/lib/pricingRules.ts). Food and drink under the minimum shows the gap;
 * one tap adds, updates or removes a "Catering minimum" line for it. It never
 * stops the proposal from being sent.
 */
export function ProposalCateringMinimum({
  proposalId,
  guestCount,
  eventDate,
  onFailure,
}: {
  proposalId: string;
  guestCount: number;
  eventDate: number | null | undefined;
  onFailure?: (error: Error) => void;
}) {
  const rules = usePricingRules();
  const lineItems = useProposalLineItems(proposalId);
  const travel = useProposalTravelFee(proposalId);
  const addLine = useMutation(
    api.lib.proposalPricing.addProposalLineAndRecompute,
  );
  const reviseLine = useMutation(
    api.lib.proposalPricing.reviseProposalLineAndRecompute,
  );
  const removeLine = useMutation(
    api.lib.proposalPricing.removeProposalLineAndRecompute,
  );
  const lines = (lineItems ?? []).filter((line) => line.deletedAt == null);
  const minimumLine = lines.find(isMinimumLine);
  const miles = travel?.fee.distanceMiles ?? null;
  const driveMinutes = travel?.driveMinutes ?? null;
  const farByDistance = rules != null && isFarAway(rules, miles, driveMinutes);
  // Untouched: follow the saved minimum line.
  const [farTicked, setFarByHand] = useState<boolean | null>(null);
  const farByHand =
    farTicked ??
    minimumLine?.description.includes("far from the kitchen") ??
    false;
  const [busy, setBusy] = useState(false);
  if (!rules || !lineItems || !hasCateringMinimums(rules)) return null;

  const farAway = farByDistance || farByHand;
  const minimum = cateringMinimumFor(rules, eventDate, farAway);
  const foodCents = lines.filter(countsTowardMinimum).reduce(
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
  );
  const gap = minimum
    ? Math.max(0, Math.round(minimum.amount * 100) - foodCents) / 100
    : 0;
  const description = minimum
    ? `${MINIMUM_LINE_DESCRIPTION} (${minimum.reason})`
    : MINIMUM_LINE_DESCRIPTION;
  const lineAmount = minimumLine ? Number(minimumLine.unitPrice) : null;
  const inStep =
    (gap === 0 && minimumLine == null) ||
    (gap > 0 && lineAmount === gap && minimumLine?.description === description);

  const apply = () => {
    setBusy(true);
    const work =
      gap === 0 && minimumLine
        ? removeLine({
            docId: minimumLine._id,
            version: Number(minimumLine.version),
          })
        : minimumLine
          ? reviseLine({
              docId: minimumLine._id,
              version: Number(minimumLine.version),
              description,
              pricingBasis: "flat",
              unitPrice: gap,
              quantity: 1,
              sortOrder: Number(minimumLine.sortOrder),
              notes: minimumLine.notes ?? undefined,
            })
          : addLine({
              proposalId: proposalId as Id<"proposals">,
              description,
              pricingBasis: "flat",
              unitPrice: gap,
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

  const label =
    gap === 0
      ? "Remove the minimum line"
      : minimumLine
        ? `Update the minimum line to ${formatMoneyExact(gap)}`
        : `Add ${formatMoneyExact(gap)} to reach the minimum`;

  return (
    <div
      className="mt-2 text-base text-ink-2"
      data-testid="proposal-catering-minimum"
    >
      <p className="flex flex-wrap items-center gap-2">
        <span className={gap > 0 && !inStep ? "text-warn" : undefined}>
          {minimum
            ? `Catering minimum: ${formatMoneyExact(minimum.amount)} (${minimum.reason}). Food and drink: ${formatMoneyExact(foodCents / 100)}${gap > 0 ? `, ${formatMoneyExact(gap)} short` : ""}.`
            : "Catering minimum: set the event date to see it."}
          {inStep && minimumLine ? " The minimum line covers it." : ""}
        </span>
        {!inStep ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={apply}
          >
            {label}
          </button>
        ) : null}
      </p>
      {rules.farAwayMinimum > 0 ? (
        <label className="mt-1 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={farAway}
            disabled={farByDistance}
            onChange={(event) => setFarByHand(event.target.checked)}
          />
          Far from the kitchen ({formatMoneyExact(rules.farAwayMinimum)}{" "}
          minimum)
          {farByDistance
            ? ` — ${[
                miles != null ? `${miles} mi` : null,
                driveMinutes != null
                  ? `${Math.floor(driveMinutes / 60)} h ${driveMinutes % 60} min`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")} each way`
            : ""}
        </label>
      ) : null}
    </div>
  );
}
