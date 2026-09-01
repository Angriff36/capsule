import { formatMoneyExact } from "../../lib/format";

type Props = {
  foodCost: number;
  costPerServing: number;
  foodSellTotal: number;
  dishCount: number;
  unpricedCount: number;
  unpricedNote: string | null;
  servings: number;
};

function Figure({
  label,
  value,
  note,
  warn = false,
  alignRight = false,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
  alignRight?: boolean;
}) {
  return (
    <div className={`px-5 py-5 ${alignRight ? "sm:text-right" : ""}`}>
      <p className="text-sm text-ink-3">{label}</p>
      <p className="mt-1 font-mono text-3xl font-semibold text-ink">{value}</p>
      {note ? (
        <p className={`mt-0.5 text-sm ${warn ? "text-warn" : "text-ink-3"}`}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The Banani-style menu summary: three headline figures in one card.
 */
export function EventMenuStatsCard({
  foodCost,
  costPerServing,
  foodSellTotal,
  dishCount,
  unpricedCount,
  unpricedNote,
  servings,
}: Props) {
  return (
    <div
      className="card grid grid-cols-1 gap-y-2 sm:grid-cols-3"
      data-testid="event-menu-food-cost"
    >
      <Figure
        label="Total food cost"
        value={formatMoneyExact(foodCost)}
        note={
          foodSellTotal > 0
            ? `food sell ${formatMoneyExact(foodSellTotal)}`
            : `${formatMoneyExact(costPerServing)} per guest`
        }
      />
      <Figure
        label="Dishes selected"
        value={String(dishCount)}
        alignRight
        note={
          unpricedCount > 0
            ? `${unpricedCount} ${unpricedCount === 1 ? "dish" : "dishes"} without a priced recipe`
            : (unpricedNote ?? `${formatMoneyExact(costPerServing)} per guest`)
        }
        warn={unpricedCount > 0 || unpricedNote != null}
      />
      <Figure
        label="Service headcount"
        value={String(servings)}
        note="guests"
        alignRight
      />
    </div>
  );
}
