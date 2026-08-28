import { formatMoney } from "../../lib/format";

export type MarginCostBucket = {
  readonly key: string;
  readonly label: string;
  readonly amount: number;
};

export type MarginRevenueLine = {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly amount: number | null;
  readonly tone?: "ink" | "ok";
};

const BUCKET_BAR: Record<string, string> = {
  food: "bg-brand",
  labor: "bg-accent",
  equipment: "bg-info",
};

/** Three headline tiles: revenue in, cost out, what is left. */
export function EventMarginTiles({
  revenue,
  totalCost,
  grossProfit,
  marginPct,
}: {
  revenue: number;
  totalCost: number;
  grossProfit: number;
  marginPct: number | null;
}) {
  const costShare = revenue > 0 ? (totalCost / revenue) * 100 : null;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <section className="card px-4 py-3.5">
        <p className="eyebrow">Total revenue</p>
        <p className="mt-1.5 font-mono text-3xl leading-none text-ink">
          {formatMoney(revenue)}
        </p>
        <p className="mt-1.5 text-base text-ink-3">
          Confirmed invoices, or the quote until one is issued
        </p>
      </section>
      <section className="card px-4 py-3.5">
        <p className="eyebrow">Total costs</p>
        <p className="mt-1.5 font-mono text-3xl leading-none text-ink">
          {formatMoney(totalCost)}
        </p>
        <p className="mt-1.5 text-base text-ink-3">
          {costShare == null
            ? "No revenue booked yet"
            : `${costShare.toFixed(1)}% of revenue`}
        </p>
      </section>
      <section
        className={`rounded-md border px-4 py-3.5 ${
          grossProfit < 0
            ? "border-danger/40 bg-danger-soft"
            : "border-ok/40 bg-ok-soft"
        }`}
      >
        <p className={`eyebrow ${grossProfit < 0 ? "text-danger" : "text-ok"}`}>
          Net margin
        </p>
        <p
          className={`mt-1.5 font-mono text-3xl leading-none ${
            grossProfit < 0 ? "text-danger" : "text-ok"
          }`}
        >
          {formatMoney(grossProfit)}
        </p>
        <p
          className={`mt-1.5 text-base ${
            grossProfit < 0 ? "text-danger" : "text-ok"
          }`}
        >
          {marginPct == null
            ? "Margin needs revenue"
            : `${marginPct.toFixed(1)}% margin`}
        </p>
      </section>
    </div>
  );
}

/** Where the revenue figure comes from, line by line. */
export function EventMarginRevenueBreakdown({
  lines,
  total,
}: {
  lines: readonly MarginRevenueLine[];
  total: number;
}) {
  return (
    <section className="card px-4 py-3.5" data-testid="event-margin-revenue">
      <h3 className="font-display text-xl leading-none text-ink">
        Revenue breakdown
      </h3>
      <dl className="mt-3">
        {lines.map((line) => (
          <div
            key={line.key}
            className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-line py-2.5"
          >
            <dt className="min-w-0">
              <span className="text-base font-medium text-ink">
                {line.label}
              </span>
              {line.hint ? (
                <span className="block text-sm text-ink-3">{line.hint}</span>
              ) : null}
            </dt>
            <dd
              className={`font-mono text-base ${
                line.tone === "ok" ? "text-ok" : "text-ink"
              }`}
            >
              {line.amount == null ? "—" : formatMoney(line.amount)}
            </dd>
          </div>
        ))}
        <div className="flex items-baseline justify-between gap-x-4 pt-2.5">
          <dt className="text-base font-bold text-ink">Revenue used</dt>
          <dd className="font-mono text-xl text-ok">{formatMoney(total)}</dd>
        </div>
      </dl>
    </section>
  );
}

/** Cost buckets with a share bar each, then the total. */
export function EventMarginCostBreakdown({
  buckets,
  total,
}: {
  buckets: readonly MarginCostBucket[];
  total: number;
}) {
  return (
    <section className="card px-4 py-3.5" data-testid="event-margin-costs">
      <h3 className="font-display text-xl leading-none text-ink">
        Cost breakdown
      </h3>
      <ul className="mt-3 flex flex-col gap-3">
        {buckets.map((bucket) => {
          const share = total > 0 ? (bucket.amount / total) * 100 : 0;
          return (
            <li key={bucket.key}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="text-base font-medium text-ink">
                  {bucket.label}
                </span>
                <span className="flex items-baseline gap-2.5">
                  <span className="font-mono text-base text-ink">
                    {formatMoney(bucket.amount)}
                  </span>
                  <span className="font-mono text-xs text-ink-3">
                    {share.toFixed(1)}%
                  </span>
                </span>
              </div>
              <span
                className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-line"
                aria-hidden="true"
              >
                <span
                  className={`block h-full rounded-full ${BUCKET_BAR[bucket.key] ?? "bg-ink-3"}`}
                  style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex items-baseline justify-between gap-x-4 border-t border-line pt-2.5">
        <span className="text-base font-bold text-ink">Total costs</span>
        <span className="font-mono text-xl text-ink">{formatMoney(total)}</span>
      </div>
    </section>
  );
}
