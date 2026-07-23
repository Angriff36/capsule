import type { UnitOfMeasure } from "./import/UnitOfMeasureMapper";
import type {
  RecipeCostLineResult,
  RecipeCostSummary,
} from "./RecipeCostCalculator";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function issueText(line: RecipeCostLineResult) {
  if (line.status === "missing_ingredient") {
    return "An ingredient on this recipe is no longer available.";
  }
  if (line.status === "missing_price") {
    return `${line.ingredientName} needs a current cost per ${line.pricingUnit}.`;
  }
  if (line.status === "incompatible_unit") {
    return `${line.ingredientName} uses ${line.lineUnit} here but is priced per ${line.pricingUnit}.`;
  }
  return null;
}

function yieldCostLabel(unit: UnitOfMeasure) {
  return unit === "portion" ? "Cost / portion" : `Cost / ${unit}`;
}

export function RecipeCostPanel({
  summary,
  yieldUnit,
  loading = false,
}: {
  summary: RecipeCostSummary;
  yieldUnit: UnitOfMeasure;
  loading?: boolean;
}) {
  const issues = summary.lines
    .map(issueText)
    .filter((issue): issue is string => issue != null);
  const hasLines = summary.totalLineCount > 0;

  return (
    <section
      className={`recipe-cost-panel${summary.isComplete ? "" : " is-incomplete"}`}
      aria-labelledby="recipe-cost-heading"
      aria-live="polite"
      data-testid="recipe-cost-panel"
    >
      <div className="recipe-cost-intro">
        <p className="eyebrow">Live food cost</p>
        <div className="recipe-cost-title-row">
          <h2 id="recipe-cost-heading">Recipe cost</h2>
          <span className="recipe-cost-live">
            <i aria-hidden="true" /> Current pricing
          </span>
        </div>
        <p>
          Ingredient quantities × batch multiplier, priced in each ingredient's
          current catalog unit.
        </p>
      </div>

      <dl className="recipe-cost-metrics" aria-busy={loading}>
        <div>
          <dt>{summary.isComplete ? "Batch total" : "Priced subtotal"}</dt>
          <dd data-testid="recipe-batch-cost">
            {loading ? "—" : money.format(summary.batchCost)}
          </dd>
        </div>
        <div>
          <dt>
            {summary.isComplete
              ? yieldCostLabel(yieldUnit)
              : `Known ${yieldCostLabel(yieldUnit).toLowerCase()}`}
          </dt>
          <dd data-testid="recipe-portion-cost">
            {loading || summary.costPerYieldUnit == null
              ? "—"
              : money.format(summary.costPerYieldUnit)}
          </dd>
        </div>
        <div>
          <dt>Pricing coverage</dt>
          <dd data-testid="recipe-pricing-coverage">
            {loading
              ? "Loading"
              : `${summary.pricedLineCount} / ${summary.totalLineCount} lines`}
          </dd>
        </div>
      </dl>

      {!loading && !hasLines ? (
        <p className="recipe-cost-note">
          Add an ingredient line to begin costing.
        </p>
      ) : null}

      {!loading && issues.length ? (
        <div className="recipe-cost-attention" role="status">
          <strong>
            {issues.length} {issues.length === 1 ? "line needs" : "lines need"}{" "}
            pricing attention
          </strong>
          <ul>
            {issues.slice(0, 3).map((issue, index) => (
              <li key={`${index}:${issue}`}>{issue}</li>
            ))}
          </ul>
          {issues.length > 3 ? <span>+ {issues.length - 3} more</span> : null}
        </div>
      ) : null}
    </section>
  );
}
