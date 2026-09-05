import { formatTppMoney, formatTppQuantity } from "./formatters";
import { TppReportDocument } from "./TppReportDocument";
import { TppReportLabels } from "./TppReportLabels";
import { TppReportTable } from "./TppReportTable";
import type { TppReportResult as Result } from "./types";

export function TppReportResult({ result }: { result: Result }) {
  const count =
    result.kind === "document"
      ? result.sections.length
      : result.kind === "labels"
        ? result.labels.length
        : result.rows.length;
  if (count === 0)
    return (
      <div className="document-empty tpp-result-empty">
        <p>No matching records.</p>
        <span>Try another event, contact, or date range.</span>
      </div>
    );
  return (
    <div className="tpp-print-area print-sheet">
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
        />
      ) : null}
      {result.kind === "document" ? (
        <TppReportDocument sections={result.sections} />
      ) : null}
      {result.kind === "labels" ? (
        <TppReportLabels stock={result.stock} labels={result.labels} />
      ) : null}
    </div>
  );
}
