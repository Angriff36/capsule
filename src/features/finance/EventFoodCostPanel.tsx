import { formatMoney } from "../../lib/format";
import {
  foodCostGapText,
  foodCostReasonText,
  priceSourceText,
  useEventFoodCost,
} from "../../lib/culinaryDemandClient";

const REVENUE_SOURCE: Record<string, string> = {
  closeout: "closeout revenue",
  invoices: "billed invoices",
  quote: "the quoted price",
};

const pct = (value: number | null) => (value == null ? "—" : `${value}%`);

/**
 * Food cost for one event: the menu priced at the event date (with what it
 * leaves out) beside the closeout actual, purchases plus recorded waste.
 * Read only — nothing here changes a quote, invoice or closeout.
 */
export function EventFoodCostPanel({
  eventId,
  enabled = true,
}: {
  eventId: string;
  enabled?: boolean;
}) {
  const report = useEventFoodCost(eventId, enabled);
  if (!enabled || !report) return null;
  const { estimated, actual } = report;
  const gap = foodCostGapText(estimated);
  const topLines = estimated.lines.slice(0, 8);
  return (
    <section className="card px-4 py-3.5" data-testid="event-food-cost-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow">Food cost · estimated vs actual</p>
        {report.revenue ? (
          <p className="text-base text-ink-3">
            Food cost % uses {REVENUE_SOURCE[report.revenue.source]}
          </p>
        ) : null}
      </header>
      <dl className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-base text-ink-3">
            Estimated
            {report.asOf
              ? ` (prices on ${new Date(report.asOf).toLocaleDateString()})`
              : ""}
          </dt>
          <dd className="font-mono text-2xl text-ink">
            {estimated.complete ? "" : "at least "}
            {formatMoney(estimated.knownCost)}
          </dd>
          <dd className="text-base text-ink-3">
            {formatMoney(estimated.costPerGuest)} a guest ·{" "}
            {pct(report.estimatedFoodCostPercent)} of revenue
          </dd>
        </div>
        <div>
          <dt className="text-base text-ink-3">
            Actual (purchases + recorded waste)
          </dt>
          <dd className="font-mono text-2xl text-ink">
            {actual ? formatMoney(actual.total) : "—"}
          </dd>
          <dd className="text-base text-ink-3">
            {actual
              ? `${formatMoney(actual.ingredientCost)} bought + ${formatMoney(actual.wasteCost)} wasted · ${formatMoney(actual.costPerGuest)} a guest · ${pct(report.actualFoodCostPercent)} of revenue${actual.finalized ? "" : " · closeout not final"}`
              : "Shows once the closeout has its costs"}
          </dd>
        </div>
        <div>
          <dt className="text-base text-ink-3">Actual minus estimate</dt>
          <dd
            className={`font-mono text-2xl ${
              report.variance == null
                ? "text-ink-3"
                : report.variance > 0
                  ? "text-danger"
                  : "text-ok"
            }`}
          >
            {report.variance == null ? "—" : formatMoney(report.variance)}
          </dd>
          {report.variance != null && !estimated.complete ? (
            <dd className="text-base text-ink-3">
              The estimate is missing prices, so this gap is too big.
            </dd>
          ) : null}
        </div>
      </dl>
      {gap ? (
        <p
          className="banner banner-danger mt-3"
          data-testid="event-food-cost-gap"
        >
          {gap}
        </p>
      ) : null}
      {topLines.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-base text-ink-2">
            Where the estimate comes from
          </summary>
          <table className="data-table mt-2">
            <thead>
              <tr>
                <th>Ingredient</th>
                <th>Cost</th>
                <th>Price used</th>
              </tr>
            </thead>
            <tbody>
              {topLines.map((line) => (
                <tr key={line.ingredientId}>
                  <td>{line.name}</td>
                  <td className="font-mono">
                    {line.unknownRows && !line.cost
                      ? "—"
                      : formatMoney(line.cost)}
                  </td>
                  <td>
                    {line.unknownRows
                      ? `Not priced: ${foodCostReasonText(line.reason)}`
                      : priceSourceText(line)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}
