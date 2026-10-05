import {
  METRIC_TENANT_SCOPE,
  metricCurrencyLabel,
  metricDefinition,
  metricRecordBasisLabel,
  metricTimeBasisLabel,
  type MetricId,
} from "./metricDefinitions";

/**
 * "How these numbers are counted": one fold-out line per figure on the page,
 * read from the shared metric list so the words match the sums.
 */
export function MetricDefinitionList({
  metricIds,
}: {
  readonly metricIds: readonly MetricId[];
}) {
  const unique = [...new Set(metricIds)];
  if (unique.length === 0) return null;
  return (
    <section
      className="mt-4 rounded-sm border border-line bg-panel p-3"
      aria-label="How these numbers are counted"
      data-testid="metric-definitions"
    >
      <h3 className="text-sm font-semibold text-ink">
        How these numbers are counted
      </h3>
      <p className="mt-1 text-xs text-ink-2">{METRIC_TENANT_SCOPE}</p>
      <ul className="mt-2 space-y-1">
        {unique.map((id) => (
          <MetricDefinitionItem key={id} id={id} />
        ))}
      </ul>
    </section>
  );
}

function MetricDefinitionItem({ id }: { readonly id: MetricId }) {
  const definition = metricDefinition(id);
  return (
    <li data-testid={`metric-definition-${id}`}>
      <details>
        <summary className="cursor-pointer text-sm text-ink">
          {definition.label}
          <span className="text-ink-2"> · {definition.measures}</span>
        </summary>
        <dl className="mt-1 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 pl-3 text-xs text-ink-2">
          <dt className="font-semibold">Comes from</dt>
          <dd>{definition.source}</dd>
          <dt className="font-semibold">Counts</dt>
          <dd>{definition.includes}</dd>
          <dt className="font-semibold">Leaves out</dt>
          <dd>{definition.leftOut}</dd>
          <dt className="font-semibold">Period by</dt>
          <dd>
            {definition.dateBasis} {metricTimeBasisLabel(definition.timeBasis)}
          </dd>
          <dt className="font-semibold">Money</dt>
          <dd>
            {definition.currency === "none"
              ? metricCurrencyLabel(definition.currency)
              : `${metricCurrencyLabel(definition.currency)} ${definition.tax}`}
          </dd>
          <dt className="font-semibold">Records</dt>
          <dd>{metricRecordBasisLabel(definition.recordBasis)}</dd>
          <dt className="font-semibold">See the records</dt>
          <dd>{definition.drill}</dd>
        </dl>
      </details>
    </li>
  );
}
