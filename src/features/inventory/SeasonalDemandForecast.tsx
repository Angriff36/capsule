import { useMemo, useState } from "react";
import {
  useListEvent,
  useListIngredient,
  useListIngredientDemand,
} from "../../lib/manifest-convex-react";

const TOP_N = 12;
const QUARTER_LABELS = [
  "Q1 (Jan–Mar)",
  "Q2 (Apr–Jun)",
  "Q3 (Jul–Sep)",
  "Q4 (Oct–Dec)",
];

type Forecast = {
  ingredientId: string;
  name: string;
  unit: string;
  projectedQuantity: number;
  eventCount: number;
  years: number;
};

export type SeasonalForecast = {
  quarterLabel: string;
  targetYear: number;
  rows: Forecast[];
};

// ponytail: projection = (total historical demand in the target quarter across
// past years) / (number of distinct past years with data) — a plain per-year
// average, no trend/seasonality curve. Good enough to pre-negotiate quantities.
// Add a weighted/trend model if operators find the flat average too blunt.
// Groups by ingredient+unit so mixed-unit history stays honest instead of
// summing pounds into liters.
export function computeSeasonalForecast(
  demands: ReturnType<typeof useListIngredientDemand>,
  events: ReturnType<typeof useListEvent>,
  ingredients: ReturnType<typeof useListIngredient>,
  now: number,
): SeasonalForecast {
  const current = new Date(now);
  const currentQuarter = Math.floor(current.getUTCMonth() / 3);
  const targetQuarter = (currentQuarter + 1) % 4;
  const targetYear =
    currentQuarter === 3
      ? current.getUTCFullYear() + 1
      : current.getUTCFullYear();
  const quarterLabel = QUARTER_LABELS[targetQuarter];

  if (!demands || !events || !ingredients) {
    return { quarterLabel, targetYear, rows: [] };
  }

  const startsAt = new Map<string, number>();
  for (const event of events) {
    if (event.deletedAt != null || event.startsAt == null) continue;
    startsAt.set(event._id, event.startsAt);
  }
  const ingredientName = new Map<string, string>();
  for (const ingredient of ingredients) {
    ingredientName.set(ingredient._id, ingredient.name);
  }

  // key: `${ingredientId}::${unit}`
  const buckets = new Map<
    string,
    { total: number; events: Set<string>; years: Set<number> }
  >();

  for (const demand of demands) {
    if (demand.deletedAt != null) continue;
    if (demand.requiredQuantity <= 0) continue;
    const when = startsAt.get(demand.eventId);
    if (when == null || when >= now) continue; // only past events feed the forecast
    const date = new Date(when);
    if (Math.floor(date.getUTCMonth() / 3) !== targetQuarter) continue;

    const key = `${demand.ingredientId}::${demand.unit}`;
    const bucket = buckets.get(key) ?? {
      total: 0,
      events: new Set<string>(),
      years: new Set<number>(),
    };
    bucket.total += demand.requiredQuantity;
    bucket.events.add(demand.eventId);
    bucket.years.add(date.getUTCFullYear());
    buckets.set(key, bucket);
  }

  const rows: Forecast[] = [];
  for (const [key, bucket] of buckets) {
    const [ingredientId, unit] = key.split("::");
    const years = bucket.years.size;
    rows.push({
      ingredientId,
      name: ingredientName.get(ingredientId) ?? "Unknown ingredient",
      unit,
      projectedQuantity: bucket.total / years,
      eventCount: bucket.events.size,
      years,
    });
  }

  rows.sort((a, b) => b.projectedQuantity - a.projectedQuantity);
  return { quarterLabel, targetYear, rows: rows.slice(0, TOP_N) };
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function SeasonalDemandForecast() {
  const demands = useListIngredientDemand();
  const events = useListEvent();
  const ingredients = useListIngredient();
  const [open, setOpen] = useState(false);

  const forecast = useMemo(
    () => computeSeasonalForecast(demands, events, ingredients, Date.now()),
    [demands, events, ingredients],
  );

  const loading =
    demands === undefined || events === undefined || ingredients === undefined;

  return (
    <section
      className="working-ledger mt-10"
      data-testid="seasonal-demand-forecast"
    >
      <div className="ledger-heading">
        <div>
          <p className="eyebrow">Pre-season planning</p>
          <h2>
            Seasonal demand forecast · {forecast.quarterLabel}{" "}
            {forecast.targetYear}
          </h2>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide" : "Show"}
        </button>
      </div>
      <p className="mt-1 max-w-160 text-ink-2">
        Projected from historical demand in the same quarter of past years — use
        it to pre-negotiate quantities with vendors before peak season.
      </p>
      {open ? (
        loading ? (
          <p className="mt-3 text-ink-2">Loading history…</p>
        ) : forecast.rows.length === 0 ? (
          <div className="document-empty">
            <p>No seasonal history yet</p>
            <span>
              Once you have events with ingredient demand in{" "}
              {forecast.quarterLabel} of past years, projected quantities appear
              here.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Projected demand</th>
                  <th>Based on</th>
                </tr>
              </thead>
              <tbody>
                {forecast.rows.map((row) => (
                  <tr
                    key={`${row.ingredientId}::${row.unit}`}
                    data-testid="seasonal-forecast-row"
                  >
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td className="supply-number">
                      {formatQuantity(row.projectedQuantity)} {row.unit}
                    </td>
                    <td className="supply-muted">
                      {row.eventCount} event{row.eventCount === 1 ? "" : "s"} ·{" "}
                      {row.years} year{row.years === 1 ? "" : "s"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </section>
  );
}
