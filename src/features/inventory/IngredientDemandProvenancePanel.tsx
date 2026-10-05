import { Link } from "react-router-dom";
import { useDemandProvenance } from "../facilities/useDemandProvenance";

const number = (value: unknown) =>
  typeof value === "number"
    ? value.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "-";
const steps = (snapshot: Record<string, unknown>) =>
  Array.isArray(snapshot.steps)
    ? (snapshot.steps as Array<{
        operator: string;
        label: string;
        value: unknown;
        unit?: string;
      }>)
    : [];

export function IngredientDemandProvenancePanel({
  demandId,
}: {
  demandId: string;
}) {
  const provenance = useDemandProvenance(demandId);
  if (provenance === undefined)
    return (
      <p className="demand-provenance-loading">Loading calculation trace.</p>
    );
  if (provenance === null)
    return (
      <p className="demand-provenance-empty">
        This calculation trace is not available for your account.
      </p>
    );
  const live = provenance.rows.filter((row) => !row.deleted);
  return (
    <section
      className="demand-provenance"
      aria-label="Demand calculation trace"
    >
      <header>
        <div>
          <p className="eyebrow">Calculation trace</p>
          <strong>
            {number(provenance.demand.requiredQuantity)}{" "}
            {provenance.demand.unit}
          </strong>
        </div>
        <span>
          {live.length} contributing {live.length === 1 ? "line" : "lines"}
        </span>
      </header>
      <p className="demand-provenance-reconcile">
        {provenance.contributionTotal.state === "ready" ? (
          <>
            Current contribution total:{" "}
            <b>
              {number(provenance.contributionTotal.quantity)}{" "}
              {provenance.contributionTotal.unit}
            </b>
          </>
        ) : (
          <>
            Contribution units cannot be combined safely:{" "}
            <b>
              {provenance.contributionTotal.units.join(", ") || "unknown units"}
            </b>
          </>
        )}
        <Link to={`/events/${provenance.demand.eventId}`}>Open event</Link>
      </p>
      {provenance.rows.map((row) => {
        const snapshot = row.calculationSnapshot;
        return (
          <article
            className="demand-provenance-line"
            key={row.id}
            data-testid="demand-provenance-line"
          >
            <div className="demand-provenance-line-head">
              <strong>
                {snapshot?.kind === "direct_dish"
                  ? "Dish ingredient"
                  : "Recipe contribution"}
              </strong>
              <span>
                {row.deleted
                  ? `Superseded${row.supersedeReason ? ` - ${row.supersedeReason}` : ""}`
                  : `${number(row.quantity)} ${row.unit}`}
              </span>
            </div>
            {snapshot ? (
              <>
                {steps(snapshot).length ? (
                  <ol
                    className="demand-provenance-steps"
                    aria-label="Saved calculation steps"
                  >
                    {steps(snapshot).map((step, index) => (
                      <li key={`${step.operator}-${index}`}>
                        <span>
                          {index === 0
                            ? "="
                            : step.operator === "divide"
                              ? "÷"
                              : step.operator === "convert"
                                ? "→"
                                : "×"}
                        </span>
                        {step.label}:{" "}
                        <b>
                          {number(step.value)}
                          {step.unit ? ` ${step.unit}` : ""}
                        </b>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <code>
                    Saved calculation: {number(snapshot.resultQuantity)}{" "}
                    {String(snapshot.resultUnit ?? row.unit)}
                  </code>
                )}
                <dl>
                  {[
                    ["Recipe line", snapshot.recipeLineQuantity],
                    ["Waste factor", snapshot.wasteFactor],
                    ["Batch multiplier", snapshot.batchMultiplier],
                    ["Servings", snapshot.servings],
                    ["Yield", snapshot.yieldQuantity],
                    [
                      "Result",
                      `${number(snapshot.resultQuantity)} ${String(snapshot.resultUnit ?? row.unit)}`,
                    ],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt>{String(label)}</dt>
                      <dd>{String(value ?? "-")}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="demand-provenance-empty">
                This older contribution predates saved calculation inputs.
              </p>
            )}
            <p className="demand-provenance-links">
              <Link to={`/events/${row.eventId}`}>Event</Link>
              <Link
                to={
                  row.componentId
                    ? `/kitchen/components/${row.componentId}`
                    : `/kitchen/dishes/${row.dishId}`
                }
              >
                {row.componentId ? "Source recipe" : "Dish recipe"}
              </Link>
            </p>
          </article>
        );
      })}
      {provenance.changes.length ? (
        <section className="demand-provenance-history">
          <p className="eyebrow">Changed inputs</p>
          {provenance.changes.map((change) => (
            <div key={`${change.at}-${change.kind}`}>
              <p>
                {change.kind === "recalculated"
                  ? `Quantity ${number(change.previousQuantity)} to ${number(change.nextQuantity)}`
                  : "Contribution superseded"}
                {change.reason ? ` - ${change.reason}` : ""}
                {change.at > 0 ? (
                  <time dateTime={new Date(change.at).toISOString()}>
                    {" "}
                    {new Date(change.at).toLocaleString()}
                  </time>
                ) : null}
              </p>
              {change.changedInputs.map((input) => (
                <p className="demand-provenance-change" key={input.label}>
                  {input.label}: {input.before} to {input.after}
                </p>
              ))}
            </div>
          ))}
        </section>
      ) : null}
    </section>
  );
}
