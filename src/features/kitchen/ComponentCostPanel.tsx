import type { UnitOfMeasure } from "./import/UnitOfMeasureMapper";
import type {
  ComponentCostLineResult,
  ComponentCostSummary,
} from "./ComponentCostCalculator";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function issueText(line: ComponentCostLineResult) {
  if (line.status === "missing_ingredient") {
    return "An ingredient on this component is no longer available.";
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

export function ComponentCostPanel({
  summary,
  yieldUnit,
  loading = false,
}: {
  summary: ComponentCostSummary;
  yieldUnit: UnitOfMeasure;
  loading?: boolean;
}) {
  const issues = summary.lines
    .map(issueText)
    .filter((issue): issue is string => issue != null);
  const hasLines = summary.totalLineCount > 0;

  return (
    <section
      className={`component-cost-panel${summary.isComplete ? "" : " is-incomplete"}`}
      aria-labelledby="component-cost-heading"
      aria-live="polite"
      data-testid="component-cost-panel"
    >
      <div className="component-cost-intro">
        <p className="eyebrow">Live food cost</p>
        <div className="component-cost-title-row">
          <h2 id="component-cost-heading">Component cost</h2>
          <span className="component-cost-live">
            <i aria-hidden="true" /> Current pricing
          </span>
        </div>
        <p>
          Ingredient quantities × batch multiplier, priced in each ingredient's
          current catalog unit.
        </p>
      </div>

      <dl className="component-cost-metrics" aria-busy={loading}>
        <div>
          <dt>{summary.isComplete ? "Batch total" : "Priced subtotal"}</dt>
          <dd data-testid="component-batch-cost">
            {loading ? "—" : money.format(summary.batchCost)}
          </dd>
        </div>
        <div>
          <dt>
            {summary.isComplete
              ? yieldCostLabel(yieldUnit)
              : `Known ${yieldCostLabel(yieldUnit).toLowerCase()}`}
          </dt>
          <dd data-testid="component-portion-cost">
            {loading || summary.costPerYieldUnit == null
              ? "—"
              : money.format(summary.costPerYieldUnit)}
          </dd>
        </div>
        <div>
          <dt>Pricing coverage</dt>
          <dd data-testid="component-pricing-coverage">
            {loading
              ? "Loading"
              : `${summary.pricedLineCount} / ${summary.totalLineCount} lines`}
          </dd>
        </div>
      </dl>

      {!loading && !hasLines ? (
        <p className="component-cost-note">
          Add an ingredient line to begin costing.
        </p>
      ) : null}

      {!loading && issues.length ? (
        <div className="component-cost-attention" role="status">
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
