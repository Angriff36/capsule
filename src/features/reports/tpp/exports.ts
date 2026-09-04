import { displayCell } from "./formatters";
import type { TppColumn, TppReportResult, TppRow } from "./types";

const FORMULA_PREFIX = /^[=+\-@]/;

export function spreadsheetSafeText(value: string): string {
  return FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

export function escapeCsvCell(value: unknown): string {
  const safe = spreadsheetSafeText(String(value ?? ""));
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function tabular(result: TppReportResult): {
  columns: readonly TppColumn[];
  rows: readonly TppRow[];
} | null {
  return result.kind === "table" || result.kind === "financial" ? result : null;
}

function save(content: BlobPart, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadTppCsv(
  result: TppReportResult,
  filename: string,
): void {
  const data = tabular(result);
  if (!data)
    throw new Error("CSV export is available only for tabular reports.");
  const lines = [
    data.columns.map((column) => escapeCsvCell(column.label)).join(","),
    ...data.rows.map((row) =>
      data.columns
        .map((column) =>
          escapeCsvCell(displayCell(row.values[column.key] ?? null)),
        )
        .join(","),
    ),
  ];
  save(
    `\uFEFF${lines.join("\r\n")}`,
    "text/csv;charset=utf-8",
    `${filename}.csv`,
  );
}

function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadTppExcel(
  result: TppReportResult,
  filename: string,
): void {
  const data = tabular(result);
  if (!data)
    throw new Error("Excel export is available only for tabular reports.");
  const cell = (value: unknown, kind: TppColumn["kind"] = "text") => {
    const numeric = typeof value === "number" && kind !== "text";
    const type = numeric ? "Number" : "String";
    const rendered = numeric
      ? String(value)
      : spreadsheetSafeText(displayCell(value as never));
    return `<Cell><Data ss:Type="${type}">${xml(rendered)}</Data></Cell>`;
  };
  const rows = [
    `<Row>${data.columns.map((column) => cell(column.label)).join("")}</Row>`,
    ...data.rows.map(
      (row) =>
        `<Row>${data.columns
          .map((column) => cell(row.values[column.key], column.kind))
          .join("")}</Row>`,
    ),
  ];
  const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Report"><Table>${rows.join("")}</Table></Worksheet></Workbook>`;
  save(workbook, "application/vnd.ms-excel", `${filename}.xls`);
}
