import {
  NUTRIENTS,
  formatNutrient,
  type NutrientTotals,
} from "./ComponentNutrition";

/**
 * Per-portion / per-guest nutrition grid. Reused on component detail, menu detail,
 * and the event menu sheet — the caller decides the label and coverage copy.
 */
export function ComponentNutritionPanel({
  eyebrow = "Estimated nutrition",
  heading = "Nutrition",
  portionLabel,
  totals,
  coverageNote,
  loading = false,
}: Readonly<{
  eyebrow?: string;
  heading?: string;
  portionLabel: string;
  totals: NutrientTotals | null;
  coverageNote?: string;
  loading?: boolean;
}>) {
  return (
    <section
      className="culinary-section"
      aria-labelledby="component-nutrition-heading"
      aria-live="polite"
      data-testid="component-nutrition-panel"
    >
      <div className="culinary-section-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="component-nutrition-heading">{heading}</h2>
        </div>
        <span>{portionLabel}</span>
      </div>
      <p className="max-w-160 text-[13px] text-ink-2">
        Aggregated from each ingredient's per-unit values, converted into the
        ingredient's catalog unit. Ingredients without recorded nutrition are
        not counted.
      </p>

      <dl
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-busy={loading}
      >
        {NUTRIENTS.map((nutrient) => (
          <div
            key={nutrient.key}
            className="rounded-xl border border-line bg-paper px-3 py-2"
          >
            <dt className="text-[11px] uppercase tracking-wide text-ink-3">
              {nutrient.label}
            </dt>
            <dd
              className="mt-1 font-mono text-[15px] text-ink"
              data-testid={`nutrient-${nutrient.key}`}
            >
              {loading || totals == null
                ? "—"
                : formatNutrient(totals[nutrient.key], nutrient)}
            </dd>
          </div>
        ))}
      </dl>

      {!loading && coverageNote ? (
        <p className="mt-3 text-[12px] text-ink-3" role="status">
          {coverageNote}
        </p>
      ) : null}
    </section>
  );
}
