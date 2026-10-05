import { useState } from "react";
import type { Id } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";
import {
  useApplyProposalTravelFee,
  useProposalTravelFee,
} from "../../lib/useTravelFee";

/**
 * The event's travel & delivery fee next to a draft proposal's lines. A new
 * event proposal gets the travel line on its own; when the distance, the
 * event's fee or the company rule changes, one tap brings the line up to date.
 */
export function ProposalTravelFee({
  proposalId,
  onFailure,
}: {
  proposalId: string;
  onFailure?: (error: Error) => void;
}) {
  const data = useProposalTravelFee(proposalId);
  const apply = useApplyProposalTravelFee();
  const [busy, setBusy] = useState(false);
  if (!data || !data.editable) return null;
  const { fee, lineAmount } = data;
  if (fee.rule.mode === "off" && fee.overrideFee == null && lineAmount == null)
    return null;

  const inStep =
    (fee.fee > 0 && lineAmount === fee.fee) ||
    (fee.fee === 0 && lineAmount == null);
  const label =
    lineAmount == null
      ? "Add travel fee"
      : fee.fee === 0
        ? "Remove travel fee"
        : `Update travel fee to ${formatMoneyExact(fee.fee)}`;
  const detail =
    fee.overrideFee != null
      ? "set for this event"
      : fee.distanceMiles != null
        ? `${fee.distanceMiles} mi each way`
        : "no distance yet";

  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-2 text-base text-ink-2"
      data-testid="proposal-travel-fee"
    >
      <span>
        Event travel fee: {formatMoneyExact(fee.fee)} ({detail})
        {inStep && lineAmount != null ? " — on this proposal." : "."}
      </span>
      {!inStep ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            apply({ proposalId: proposalId as Id<"proposals"> })
              .catch((error: unknown) =>
                onFailure?.(
                  error instanceof Error ? error : new Error(String(error)),
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          {label}
        </button>
      ) : null}
    </p>
  );
}
