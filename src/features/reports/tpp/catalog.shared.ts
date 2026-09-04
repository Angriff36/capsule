import type {
  TppReportDefinition,
  TppReportParameter,
  TppReportRendererId,
  TppReportOutput,
} from "./types";

export const EVENT_PARAMETER: readonly TppReportParameter[] = [
  {
    key: "eventId",
    type: "entity",
    entity: "event",
    label: "Event",
    required: true,
  },
];

export const OPTIONAL_EVENT_PARAMETER: readonly TppReportParameter[] = [
  {
    key: "eventId",
    type: "entity",
    entity: "event",
    label: "Event",
    required: false,
  },
];

export const DATE_RANGE_PARAMETER: readonly TppReportParameter[] = [
  {
    key: "dateRange",
    type: "date_range",
    label: "Date range",
    required: true,
    default: "this_month",
  },
];

export const AS_OF_PARAMETER: readonly TppReportParameter[] = [
  {
    key: "asOf",
    type: "date",
    label: "As of",
    required: true,
    default: "today",
  },
];

export const CLIENT_PARAMETER: readonly TppReportParameter[] = [
  {
    key: "clientId",
    type: "entity",
    entity: "client",
    label: "Contact",
    required: true,
  },
];

export const PRINT_TABLE_OUTPUTS = ["print", "pdf", "csv"] as const;
export const PRINT_EXCEL_OUTPUTS = ["print", "pdf", "csv", "excel"] as const;
export const DOCUMENT_OUTPUTS = ["print", "pdf"] as const;
export const LABEL_OUTPUTS = ["print", "pdf", "labels"] as const;

export function report(
  definition: Omit<
    TppReportDefinition,
    "loader" | "evidence" | "outputs" | "renderer"
  > & {
    renderer?: TppReportRendererId;
    outputs?: readonly TppReportOutput[];
    evidence?: TppReportDefinition["evidence"];
  },
): TppReportDefinition {
  return {
    ...definition,
    loader: definition.id,
    renderer: definition.renderer ?? "table",
    outputs: definition.outputs ?? PRINT_TABLE_OUTPUTS,
    evidence: definition.evidence ?? [
      {
        kind: "inferred",
        reference: "Mangia TPP report catalog name and description",
      },
    ],
  };
}
