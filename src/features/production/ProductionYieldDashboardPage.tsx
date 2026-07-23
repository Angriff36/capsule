import { useMemo, useState } from "react";
import {
  useListProductionBatch,
  useListRecipe,
} from "../../lib/manifest-convex-react";
import { TableSkeleton } from "../../ui/primitives";
import { KitchenBookNav } from "../kitchen/KitchenBookNav";
import { ProductionWorkspaceNav } from "./ProductionWorkspaceNav";
import {
  buildProductionYieldReport,
  type ProductionYieldBatch,
  type ProductionYieldRecipe,
  type ProductionYieldRow,
  type ProductionYieldWindow,
} from "./productionYield";
import "./ProductionYieldDashboardPage.css";

const WINDOWS: readonly {
  value: ProductionYieldWindow;
  shortLabel: string;
  label: string;
}[] = [
  { value: 30, shortLabel: "30 days", label: "Last 30 days" },
  { value: 90, shortLabel: "90 days", label: "Last 90 days" },
  { value: 365, shortLabel: "1 year", label: "Last 365 days" },
];

const quantity = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const percentNumber = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const reportDate = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function signed(value: number, suffix = ""): string {
  if (Math.abs(value) < 0.005) return `0${suffix}`;
  const sign = value < 0 ? "−" : "+";
  return `${sign}${quantity.format(Math.abs(value))}${suffix}`;
}

function percentage(value: number | null): string {
  if (value == null) return "Mixed units";
  if (Math.abs(value) < 0.05) return "0.0%";
  return `${value < 0 ? "−" : "+"}${percentNumber.format(Math.abs(value))}%`;
}

function varianceClass(value: number): string {
  if (value < -0.05) return "is-under";
  if (value > 0.05) return "is-over";
  return "is-on-plan";
}

function varianceSignal(row: ProductionYieldRow): string {
  if (row.variancePercentage < -0.05) {
    return "Below plan · review shrinkage and portion size";
  }
  if (row.variancePercentage > 0.05) {
    return "Above plan · check portion consistency";
  }
  return "On plan";
}

function YieldVarianceMeter({ value }: { value: number }) {
  const width = `${Math.min(100, Math.abs(value) * 2)}%`;
  return (
    <div
      className="yield-variance-meter"
      role="img"
      aria-label={`${percentage(value)} yield variance`}
    >
      <span className="yield-variance-half is-negative">
        {value < 0 ? <i style={{ width }} /> : null}
      </span>
      <span className="yield-variance-half is-positive">
        {value > 0 ? <i style={{ width }} /> : null}
      </span>
    </div>
  );
}

export function ProductionYieldDashboard({
  batches,
  recipes,
  loading = false,
  now,
}: {
  batches: readonly ProductionYieldBatch[];
  recipes: readonly ProductionYieldRecipe[];
  loading?: boolean;
  now: Date;
}) {
  const [windowDays, setWindowDays] = useState<ProductionYieldWindow>(30);
  const report = useMemo(
    () => buildProductionYieldReport({ batches, recipes, windowDays, now }),
    [batches, recipes, windowDays, now],
  );
  const unitLabel = report.summaryUnit ?? "See rows";

  return (
    <div className="operations-stage supply-stage production-yield-stage">
      <header className="supply-masthead production-yield-masthead">
        <div>
          <p className="eyebrow">Production · Yield intelligence</p>
          <h1 className="display-title mt-2">Production yield variance</h1>
          <p className="mt-3 max-w-180 text-ink-2">
            Compare the kitchen&apos;s planned output with what each recipe
            actually produced, then start coaching where the shortfall repeats.
          </p>
        </div>
        <div className="production-yield-range" aria-label="Reporting window">
          <span>Completion window</span>
          <strong>
            {reportDate.format(report.rangeStart)} —{" "}
            {reportDate.format(report.rangeEnd)}
          </strong>
          <small>completed batches with recorded actual yield</small>
        </div>
      </header>

      <KitchenBookNav />
      <ProductionWorkspaceNav />

      <section
        className="production-yield-controls"
        aria-label="Yield report controls"
      >
        <div>
          <span className="eyebrow">Lookback</span>
          <div className="production-yield-switch">
            {WINDOWS.map((window) => (
              <button
                key={window.value}
                type="button"
                aria-label={window.label}
                aria-pressed={windowDays === window.value}
                onClick={() => setWindowDays(window.value)}
              >
                {window.shortLabel}
              </button>
            ))}
          </div>
        </div>
        <p>
          Ranked by aggregate percentage shortfall. Planned and actual yields
          are summed before the percentage is calculated.
        </p>
      </section>

      {loading ? (
        <section className="production-yield-panel">
          <TableSkeleton rows={7} />
        </section>
      ) : report.rows.length === 0 ? (
        <section className="production-yield-panel">
          <div className="document-empty">
            <p>No completed production yields in this window.</p>
            <span>
              Complete a production batch and record its actual yield to begin
              comparing recipe performance.
            </span>
          </div>
        </section>
      ) : (
        <>
          <section
            className="production-yield-scorecard"
            aria-label="Yield window summary"
          >
            <div>
              <span>Expected yield</span>
              <strong data-testid="yield-total-planned">
                {report.summaryUnit
                  ? quantity.format(report.totalPlannedYield)
                  : "Mixed units"}
              </strong>
              <small>{unitLabel}</small>
            </div>
            <div>
              <span>Actual yield</span>
              <strong data-testid="yield-total-actual">
                {report.summaryUnit
                  ? quantity.format(report.totalActualYield)
                  : "Mixed units"}
              </strong>
              <small>{unitLabel}</small>
            </div>
            <div className={varianceClass(report.totalVariancePercentage ?? 0)}>
              <span>Net variance</span>
              <strong>{percentage(report.totalVariancePercentage)}</strong>
              <small>
                {report.summaryUnit
                  ? `${signed(report.totalVarianceYield)} ${report.summaryUnit}`
                  : "Calculated per recipe and unit below"}
              </small>
            </div>
            <div>
              <span>Completed batches</span>
              <strong data-testid="yield-total-batches">
                {report.batchCount}
              </strong>
              <small>
                {report.recipeCount}{" "}
                {report.recipeCount === 1 ? "recipe" : "recipes"}
              </small>
            </div>
          </section>

          <section className="production-yield-panel">
            <div className="production-yield-panel-heading">
              <div>
                <p className="eyebrow">Training queue</p>
                <h2>Recipes furthest below plan</h2>
              </div>
              <div className="production-yield-key" aria-hidden="true">
                <span>
                  <i className="is-under" /> Under plan
                </span>
                <span>
                  <i className="is-over" /> Above plan
                </span>
              </div>
            </div>

            <div className="supply-table-wrap">
              <table className="supply-table production-yield-table">
                <caption className="sr-only">
                  Recipe yield variance ranked from largest shortfall
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rank / recipe</th>
                    <th scope="col">Batches</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Actual</th>
                    <th scope="col">Variance</th>
                    <th scope="col">Performance</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row, index) => (
                    <tr
                      key={row.key}
                      data-testid="yield-recipe-row"
                      className={varianceClass(row.variancePercentage)}
                    >
                      <td>
                        <span className="production-yield-rank">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="production-yield-recipe">
                          <strong>{row.recipeName}</strong>
                          <small>{varianceSignal(row)}</small>
                        </span>
                      </td>
                      <td>
                        {row.batchCount}{" "}
                        {row.batchCount === 1 ? "batch" : "batches"}
                      </td>
                      <td>
                        {quantity.format(row.plannedYield)} {row.yieldUnit}
                      </td>
                      <td>
                        {quantity.format(row.actualYield)} {row.yieldUnit}
                      </td>
                      <td>
                        <strong>{signed(row.varianceYield)}</strong>
                        <small>{row.yieldUnit}</small>
                      </td>
                      <td>
                        <strong className="production-yield-percent">
                          {percentage(row.variancePercentage)}
                        </strong>
                        <YieldVarianceMeter value={row.variancePercentage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <aside className="production-yield-method-note">
        <span className="eyebrow">Method</span>
        <p>
          Expected yield is the batch&apos;s planned yield, not the recipe
          catalog yield. Cancelled, active, deleted, or incomplete batches are
          excluded. Different yield units remain separate so portions are never
          added to weight or volume.
        </p>
      </aside>
    </div>
  );
}

export function ProductionYieldDashboardPage() {
  const batches = useListProductionBatch();
  const recipes = useListRecipe();
  const loading = batches === undefined || recipes === undefined;

  return (
    <ProductionYieldDashboard
      batches={(batches ?? []) as ProductionYieldBatch[]}
      recipes={(recipes ?? []) as ProductionYieldRecipe[]}
      loading={loading}
      now={new Date()}
    />
  );
}
