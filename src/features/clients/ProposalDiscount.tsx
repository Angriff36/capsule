import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";

/**
 * The whole-proposal discount on a draft: a percent of the subtotal, which
 * stays that percent as prices change, or a dollar amount.
 */
export function ProposalDiscount({
  proposalId,
  discountAmount,
  discountPercent,
  onFailure,
}: {
  proposalId: string;
  discountAmount: number;
  discountPercent: number | null;
  onFailure?: (error: Error) => void;
}) {
  const setDiscount = useMutation(api.lib.proposalPricing.setProposalDiscount);
  const [kind, setKind] = useState<"percent" | "amount">(
    discountPercent != null || discountAmount === 0 ? "percent" : "amount",
  );
  const [value, setValue] = useState(
    discountPercent != null
      ? String(discountPercent)
      : discountAmount > 0
        ? String(discountAmount)
        : "",
  );
  const [busy, setBusy] = useState(false);

  const save = async (next: { percent?: number; amount?: number }) => {
    setBusy(true);
    try {
      await setDiscount({ proposalId: proposalId as Id<"proposals">, ...next });
    } catch (error) {
      onFailure?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) return;
        void save(
          kind === "percent" ? { percent: number } : { amount: number },
        );
      }}
    >
      <label className="grid gap-1 text-sm text-ink-2">
        Discount
        <span className="flex gap-1">
          <input
            className="input w-24"
            type="number"
            min="0"
            step="0.01"
            max={kind === "percent" ? 100 : undefined}
            value={value}
            placeholder="None"
            aria-label="Discount"
            disabled={busy}
            onChange={(event) => setValue(event.target.value)}
          />
          <select
            className="input w-28"
            value={kind}
            aria-label="Discount as"
            disabled={busy}
            onChange={(event) =>
              setKind(event.target.value as "percent" | "amount")
            }
          >
            <option value="percent">% off</option>
            <option value="amount">$ off</option>
          </select>
        </span>
      </label>
      <button type="submit" className="btn btn-ghost btn-sm" disabled={busy}>
        {busy ? "Saving…" : "Apply discount"}
      </button>
      {discountAmount > 0 ? (
        <>
          <span className="text-sm text-ink-2">
            Now {formatMoneyExact(discountAmount)} off
            {discountPercent != null ? ` (${discountPercent}%)` : ""}.
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={() => {
              setValue("");
              void save({ amount: 0 });
            }}
          >
            Remove discount
          </button>
        </>
      ) : null}
    </form>
  );
}
