import {
  NUTRIENTS,
  formatNutrient,
  type NutrientCoverage,
  type NutrientDescriptor,
  type NutrientTotals,
} from "./ComponentNutrition";

function nutrientText(
  totals: NutrientTotals,
  nutrient: NutrientDescriptor,
  coverage: NutrientCoverage | undefined,
): string {
  const state = coverage?.[nutrient.key] ?? "complete";
  if (state === "unknown") return "Unknown";
  const value = formatNutrient(totals[nutrient.key], nutrient);
  return state === "partial" ? `at least ${value}` : value;
}

/**
 * Per-portion / per-guest nutrition grid. Reused on component detail, menu detail,
 * and the event menu sheet — the caller decides the label and coverage copy.
 */
export function ComponentNutritionPanel({
  eyebrow = "Estimated nutrition",
  heading = "Nutrition",
  portionLabel,
  totals,
  coverage,
  coverageNote,
  loading = false,
}: Readonly<{
  eyebrow?: string;
  heading?: string;
  portionLabel: string;
  totals: NutrientTotals | null;
  /** Per nutrient: unknown shows "Unknown", partial shows "at least". */
  coverage?: NutrientCoverage;
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
      <p className="max-w-160 text-base text-ink-2">
        Aggregated from each ingredient's per-unit values, converted into the
        ingredient's catalog unit. Ingredients without nutrition on file are not
        counted. A value no ingredient has on file shows as Unknown, never zero.
      </p>

      <dl
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        aria-busy={loading}
      >
        {NUTRIENTS.map((nutrient) => (
          <div
            key={nutrient.key}
            className="rounded-sm border border-line bg-panel px-3 py-2"
          >
            <dt className="text-xs uppercase tracking-wide text-ink-3">
              {nutrient.label}
            </dt>
            <dd
              className="mt-1 font-mono text-lg text-ink"
              data-testid={`nutrient-${nutrient.key}`}
            >
              {loading || totals == null
                ? "—"
                : nutrientText(totals, nutrient, coverage)}
            </dd>
          </div>
        ))}
      </dl>

      {!loading && coverageNote ? (
        <p className="mt-3 text-sm text-ink-3" role="status">
          {coverageNote}
        </p>
      ) : null}
    </section>
  );
}
