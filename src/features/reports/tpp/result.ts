import type {
  TppColumn,
  TppDocumentSection,
  TppGroup,
  TppLabel,
  TppMeasure,
  TppReportResult,
  TppRow,
  TppTotal,
} from "./types";

export type TppTabularResult = Extract<TppReportResult, { kind: "table" }>;
export type TppDocumentResult = Extract<TppReportResult, { kind: "document" }>;
export type TppLabelResult = Extract<TppReportResult, { kind: "labels" }>;
export type TppFinancialResult = Extract<
  TppReportResult,
  { kind: "financial" }
>;

export function tableResult(
  title: string,
  columns: readonly TppColumn[],
  rows: readonly TppRow[],
  groups: readonly TppGroup[] = [],
  totals: readonly TppTotal[] = [],
): TppTabularResult {
  return { kind: "table", title, columns, rows, groups, totals };
}

export function documentResult(
  title: string,
  template: string,
  sections: readonly TppDocumentSection[],
): TppDocumentResult {
  return { kind: "document", title, template, sections };
}

export function labelResult(
  title: string,
  stock: TppLabelResult["stock"],
  labels: readonly TppLabel[],
): TppLabelResult {
  return { kind: "labels", title, stock, labels };
}

export function financialResult(
  title: string,
  columns: readonly TppColumn[],
  rows: readonly TppRow[],
  groups: readonly TppGroup[] = [],
  totals: readonly TppTotal[] = [],
  measures: readonly TppMeasure[] = [],
): TppFinancialResult {
  return { kind: "financial", title, columns, rows, groups, totals, measures };
}
