import { useQuery } from "convex/react";
import { api } from "../../lib/api";
import { formatMoneyExact } from "../../lib/format";
import type { QuotePicksValue } from "./QuoteMenuChoice";

/**
 * The estimate for the visitor's picks (spec CF-4-3). It comes from the same
 * server calculation the saved request and the draft proposal use, and it is
 * always called an estimate: the price is final only in the proposal.
 */
export function QuoteEstimatePanel({
  eventDate,
  guestCount,
  value,
}: Readonly<{
  eventDate?: number;
  guestCount?: number;
  value: QuotePicksValue;
}>) {
  const ready =
    eventDate != null &&
    guestCount != null &&
    (value.menuId != null || value.extras.length > 0);
  const result = useQuery(
    api.lib.quoteSelections.estimateQuote,
    ready
      ? {
          eventDate,
          guestCount,
          menuId: value.menuId,
          picks: value.picks,
          extras: value.extras,
        }
      : "skip",
  );
  if (!ready) return null;
  if (result === undefined) {
    return <p className="text-xs text-ink-3">Working out your estimate…</p>;
  }
  if (result === null) return null;
  if (!result.ok) {
    return (
      <p role="alert" className="text-xs text-danger">
        {result.problem}
      </p>
    );
  }
  const estimate = result.estimate;
  return (
    <section
      aria-labelledby="quote-estimate-heading"
      className="border border-line rounded-sm p-4 bg-canvas"
    >
      <h3
        id="quote-estimate-heading"
        className="text-sm font-semibold text-ink"
      >
        Estimate — not a final price
      </h3>
      <ul className="mt-2 space-y-1 text-sm">
        {estimate.lines.map((line) => (
          <li key={line.description} className="flex justify-between gap-3">
            <span className="text-ink-2">{line.description}</span>
            <span className="text-ink tabular-nums">
              {formatMoneyExact(line.amount)}
            </span>
          </li>
        ))}
        {estimate.extras.map((extra) => (
          <li key={extra.description} className="flex justify-between gap-3">
            <span className="text-ink-2">Extra: {extra.description}</span>
            <span className="text-ink tabular-nums">
              {formatMoneyExact(extra.amount)}
            </span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-line pt-1 font-semibold">
          <span>Estimated total</span>
          <span className="tabular-nums">
            {formatMoneyExact(estimate.total)}
          </span>
        </li>
      </ul>
      <ul className="mt-2 list-disc pl-4 text-xs text-ink-3">
        {estimate.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </section>
  );
}
