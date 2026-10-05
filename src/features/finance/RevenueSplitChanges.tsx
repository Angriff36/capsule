import { useState } from "react";
import {
  useRevenueAttributionAllowOverRevenue,
  useRevenueAttributionChangeSplit,
} from "../../lib/manifest-convex-react";
import { useActionPrompt } from "../../ui/action-prompt";
import { FinanceFailureBanner } from "./FinanceFailureBanner";

type Split = {
  readonly _id: string;
  readonly status: string;
  readonly allocationMethod: string;
  readonly percentBasis?: number | null;
  readonly fixedAmount?: number | null;
  readonly venueCommissionTermId?: string | null;
  readonly overrideReason?: string | null;
  readonly overRevenueReason?: string | null;
};

const CHANGEABLE = new Set(["draft", "pending_approval", "rejected"]);

/** Change a split with a reason, or let it go past the event's revenue
 * with a reason (spec §7.3 / §8.5). Both reasons stay on the split. */
export function RevenueSplitChanges({ split }: { readonly split: Split }) {
  const changeSplit = useRevenueAttributionChangeSplit();
  const allowOver = useRevenueAttributionAllowOverRevenue();
  const { prompt, host } = useActionPrompt();
  const [failure, setFailure] = useState<unknown>(null);
  const percent = split.allocationMethod === "percent";

  const change = async () => {
    const value = await prompt.askReason({
      title: percent ? "New percent" : "New amount",
      description: percent
        ? "The percent this split should take, from 0.01 to 100."
        : "The fixed amount this split should take.",
      label: percent ? "Percent" : "Amount",
      confirmLabel: "Next",
    });
    if (!value) return;
    const number = Number(value.trim().replace(/[%$,]/g, ""));
    if (!Number.isFinite(number)) {
      setFailure(new Error("Type a number, like 10 or 250."));
      return;
    }
    const reason = await prompt.askReason({
      title: "Why the change?",
      description: "Kept on the split so anyone can see why it differs.",
      label: "Reason",
      confirmLabel: "Change split",
    });
    if (!reason) return;
    setFailure(null);
    await changeSplit({
      docId: split._id,
      reason,
      ...(percent ? { percentBasis: number } : { fixedAmount: number }),
    }).catch(setFailure);
  };

  const allow = async () => {
    const reason = await prompt.askReason({
      title: "Allow over the event's revenue",
      description:
        "This event's splits may then add up to more than its revenue. Say why.",
      label: "Reason",
      confirmLabel: "Allow",
    });
    if (!reason) return;
    setFailure(null);
    await allowOver({ docId: split._id, reason }).catch(setFailure);
  };

  return (
    <div
      className="space-y-2 text-sm text-ink-2"
      data-testid="revenue-split-changes"
    >
      {host}
      {failure != null ? <FinanceFailureBanner error={failure} /> : null}
      {split.venueCommissionTermId ? (
        <p>Taken from the venue term in force when the event was booked.</p>
      ) : null}
      {split.overrideReason ? <p>Changed: {split.overrideReason}</p> : null}
      {split.overRevenueReason ? (
        <p>May go over the event's revenue: {split.overRevenueReason}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {CHANGEABLE.has(split.status) ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void change()}
          >
            Change split
          </button>
        ) : null}
        {split.status !== "applied" && !split.overRevenueReason ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void allow()}
          >
            Allow over revenue
          </button>
        ) : null}
      </div>
    </div>
  );
}
