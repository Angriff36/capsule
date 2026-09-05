export const TPP_REPORT_CATEGORIES = [
  "contacts",
  "event",
  "financial",
  "tpp_general",
] as const;

export type TppReportCategory = (typeof TPP_REPORT_CATEGORIES)[number];
export type TppReportId = string;
export type TppReportOutput = "print" | "pdf" | "csv" | "excel" | "labels";
export type TppReportRendererId =
  "table" | "ledger" | "event_document" | "worksheet" | "labels" | "financial";
export type TppReportLoaderId = TppReportId;

export type TppReportEntity =
  "event" | "client" | "person" | "vendor" | "venue";

export type TppReportParameter =
  | {
      key: string;
      type: "date";
      label: string;
      required: boolean;
      default: "today" | "month_start" | "month_end";
    }
  | {
      key: string;
      type: "date_range";
      label: string;
      required: true;
      default: "today" | "this_week" | "this_month";
    }
  | {
      key: string;
      type: "entity";
      entity: TppReportEntity;
      label: string;
      required: boolean;
      multiple?: boolean;
    }
  | {
      key: string;
      type: "enum";
      label: string;
      required: boolean;
      multiple?: boolean;
      options: readonly { value: string; label: string }[];
    }
  | {
      key: string;
      type: "boolean";
      label: string;
      default: boolean;
    }
  | {
      key: string;
      type: "text";
      label: string;
      required: boolean;
    };

export interface TppReportEvidence {
  kind: "mangia_sample" | "published" | "tenant_comparison" | "inferred";
  reference: string;
}

export interface TppReportDefinition {
  id: TppReportId;
  name: string;
  description: string;
  category: TppReportCategory;
  parameters: readonly TppReportParameter[];
  loader: TppReportLoaderId;
  renderer: TppReportRendererId;
  outputs: readonly TppReportOutput[];
  evidence: readonly TppReportEvidence[];
}

export interface TppReportRequest {
  reportId: TppReportId;
  parameters: Readonly<Record<string, string | string[] | boolean | number>>;
  asOf: number;
}

export interface TppReportOption {
  id: string;
  label: string;
}

export interface TppColumn {
  key: string;
  label: string;
  kind: "text" | "date" | "number" | "money" | "quantity";
}

export type TppCellValue = string | number | boolean | null;

export interface TppRow {
  id: string;
  values: Readonly<Record<string, TppCellValue>>;
}

export interface TppGroup {
  key: string;
  label: string;
  rowIds: readonly string[];
  totals: readonly TppTotal[];
}

export interface TppTotal {
  key: string;
  label: string;
  value: number;
  kind: "number" | "money" | "quantity" | "percentage";
}

export interface TppMeasure extends TppTotal {
  emphasis?: "primary" | "secondary";
}

export interface TppDocumentSection {
  id: string;
  heading?: string;
  rows: readonly { label?: string; value: string }[];
}

export interface TppLabel {
  id: string;
  lines: readonly string[];
}

export type TppReportResult =
  | {
      kind: "table";
      title: string;
      columns: readonly TppColumn[];
      rows: readonly TppRow[];
      groups: readonly TppGroup[];
      totals: readonly TppTotal[];
    }
  | {
      kind: "document";
      title: string;
      template: string;
      sections: readonly TppDocumentSection[];
    }
  | {
      kind: "labels";
      title: string;
      stock: "avery_5160" | "avery_5163" | "table_tent" | "envelope_10";
      labels: readonly TppLabel[];
    }
  | {
      kind: "financial";
      title: string;
      columns: readonly TppColumn[];
      rows: readonly TppRow[];
      groups: readonly TppGroup[];
      totals: readonly TppTotal[];
      measures: readonly TppMeasure[];
    };
