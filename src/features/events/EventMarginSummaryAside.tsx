import { type ReactNode } from "react";
import { formatMoney } from "../../lib/format";
import type { MarginCostBucket } from "./EventMarginBreakdown";

function AsideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card px-3.5 py-3">
      <h3 className="mb-2.5 text-sm font-bold tracking-[0.06em] text-ink uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function MoneyRow({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-base text-ink-3">{label}</span>
      <span className={`font-mono text-base font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}

function PerCover({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="border-b border-line py-1.5 last:border-b-0">
      <p className="text-base text-ink-3">{label}</p>
      <p className={`font-mono text-xl leading-tight ${tone}`}>{value}</p>
    </div>
  );
}

/** Right-hand rail for the Margin tab: summary, per-cover, biggest costs. */
export function EventMarginSummaryAside({
  revenue,
  totalCost,
  grossProfit,
  marginPct,
  headcount,
  buckets,
  budget,
  budgetVariance,
}: {
  revenue: number;
  totalCost: number;
  grossProfit: number;
  marginPct: number | null;
  headcount: number;
  buckets: readonly MarginCostBucket[];
  budget: number;
  budgetVariance: number | null;
}) {
  const ranked = [...buckets]
    .filter((bucket) => bucket.amount > 0)
    .sort((left, right) => right.amount - left.amount);
  const profitTone = grossProfit < 0 ? "text-danger" : "text-ok";

  return (
    <div className="flex flex-col gap-3" data-testid="event-margin-aside">
      <AsideCard title="Margin summary">
        <div className="divide-y divide-line">
          <div className="pb-1">
            <MoneyRow label="Revenue" value={formatMoney(revenue)} />
            <MoneyRow label="Costs" value={formatMoney(totalCost)} />
          </div>
          <div className="pt-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-medium text-ink">Profit</span>
              <span className={`font-mono text-xl ${profitTone}`}>
                {formatMoney(grossProfit)}
              </span>
            </div>
            <p className={`mt-0.5 text-right font-mono text-xs ${profitTone}`}>
              {marginPct == null
                ? "no revenue booked"
                : `${marginPct.toFixed(1)}% margin`}
            </p>
          </div>
        </div>
      </AsideCard>

      {headcount > 0 ? (
        <AsideCard title="Per cover">
          <PerCover
            label="Revenue per cover"
            value={formatMoney(revenue / headcount)}
          />
          <PerCover
            label="Cost per cover"
            value={formatMoney(totalCost / headcount)}
          />
          <PerCover
            label="Profit per cover"
            value={formatMoney(grossProfit / headcount)}
            tone={profitTone}
          />
          <p className="mt-1.5 font-mono text-xs text-ink-3">
            across {headcount} expected covers
          </p>
        </AsideCard>
      ) : null}

      {ranked.length > 0 ? (
        <AsideCard title="Largest costs">
          <ul className="flex flex-col gap-1.5">
            {ranked.map((bucket) => (
              <li
                key={bucket.key}
                className="flex items-center justify-between gap-3 rounded-sm border border-line px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-base text-ink">
                  {bucket.label}
                </span>
                <span className="font-mono text-xs font-semibold text-accent-deep">
                  {formatMoney(bucket.amount)}
                </span>
              </li>
            ))}
          </ul>
        </AsideCard>
      ) : null}

      {budget > 0 && budgetVariance != null ? (
        <section
          className={`rounded-md border px-3.5 py-3 ${
            budgetVariance < 0
              ? "border-danger/40 bg-danger-soft"
              : "border-info/40 bg-info-soft"
          }`}
        >
          <h3
            className={`text-sm font-bold tracking-[0.06em] uppercase ${
              budgetVariance < 0 ? "text-danger" : "text-info"
            }`}
          >
            Budget variance
          </h3>
          <p
            className={`mt-1 font-mono text-xl ${
              budgetVariance < 0 ? "text-danger" : "text-info"
            }`}
          >
            {formatMoney(budgetVariance)}
          </p>
          <p className="mt-1 text-base text-ink-2">
            {budgetVariance < 0 ? "Over" : "Under"} the {formatMoney(budget)}{" "}
            budget for this event.
          </p>
        </section>
      ) : null}
    </div>
  );
}
