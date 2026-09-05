import { TPP_LABEL_DIMENSIONS } from "./labels";
import type { CSSProperties } from "react";
import type { TppLabel, TppReportResult } from "./types";

export function TppReportLabels({
  stock,
  labels,
}: {
  stock: Extract<TppReportResult, { kind: "labels" }>["stock"];
  labels: readonly TppLabel[];
}) {
  const size = TPP_LABEL_DIMENSIONS[stock];
  return (
    <div
      className={`tpp-label-sheet tpp-label-${stock}`}
      style={
        {
          "--label-width": `${size.widthIn}in`,
          "--label-height": `${size.heightIn}in`,
        } as CSSProperties
      }
    >
      {labels.map((label) => (
        <article key={label.id}>
          {label.lines.map((line, index) => (
            <span key={`${label.id}-${index}`}>{line}</span>
          ))}
        </article>
      ))}
    </div>
  );
}
