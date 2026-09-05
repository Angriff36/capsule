import type { TppLabel, TppReportResult } from "./types";

export const TPP_LABEL_DIMENSIONS = {
  avery_5160: { widthIn: 2.625, heightIn: 1 },
  avery_5163: { widthIn: 4, heightIn: 2 },
  table_tent: { widthIn: 3.5, heightIn: 2 },
  envelope_10: { widthIn: 9.5, heightIn: 4.125 },
} as const;

export function tppLabels(
  title: string,
  stock: Extract<TppReportResult, { kind: "labels" }>["stock"],
  labels: readonly TppLabel[],
): TppReportResult {
  return { kind: "labels", title, stock, labels };
}
