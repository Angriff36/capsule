import { formatTppMoney, formatTppQuantity } from "./formatters";
import { TppReportDocument } from "./TppReportDocument";
import { TppReportLabels } from "./TppReportLabels";
import { TppReportSummary } from "./TppReportSummary";
import { tppRowCount, type TppReportSummary as Summary } from "./reportSummary";
import { TppReportTable } from "./TppReportTable";
import type { TppReportResult as Result } from "./types";

export function TppReportResult({
  result,
  summary,
}: {
  result: Result;
  summary?: Summary;
}) {
  const header = (
    <TppReportSummary summary={summary} notices={result.notices ?? []} />
  );
  if (tppRowCount(result) === 0)
    return (
      <>
        {header}
        <div className="document-empty tpp-result-empty">
          <p>Nothing matches.</p>
          <span>Try another event, contact, or date range.</span>
        </div>
      </>
    );
  return (
    <div className="tpp-print-area print-sheet">
      {header}
      {result.kind === "financial" && result.measures.length ? (
        <dl className="tpp-measures">
          {result.measures.map((measure) => (
            <div key={measure.key} data-emphasis={measure.emphasis}>
              <dt>{measure.label}</dt>
              <dd>
                {measure.kind === "money"
                  ? formatTppMoney(measure.value)
                  : measure.kind === "percentage"
                    ? `${formatTppQuantity(measure.value)}%`
                    : formatTppQuantity(measure.value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {result.kind === "table" || result.kind === "financial" ? (
        <TppReportTable
          columns={result.columns}
          rows={result.rows}
          totals={result.totals}
          context={result.kind === "table" ? result.context : undefined}
        />
      ) : null}
      {result.kind === "document" ? (
        <TppReportDocument
          sections={result.sections}
          template={result.template}
        />
      ) : null}
      {result.kind === "labels" ? (
        <TppReportLabels stock={result.stock} labels={result.labels} />
      ) : null}
    </div>
  );
}
