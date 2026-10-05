import {
  formatTppDate,
  formatTppDateTime,
  formatTppMoney,
  formatTppPercent,
  formatTppQuantity,
} from "./formatters";
import type { TppReportOptions } from "./TppReportParameters";
import type {
  TppReportDefinition,
  TppReportEntity,
  TppReportOption,
  TppReportRequest,
  TppReportResult,
  TppTotal,
} from "./types";

export interface TppSummaryLine {
  label: string;
  value: string;
}

/**
 * What one report run was: the choices it ran with, when it ran, how many
 * rows it has, its totals and anything it could not read. The screen, print,
 * CSV and Excel all show these same lines, so the copies always agree.
 */
export interface TppReportSummary {
  choices: readonly TppSummaryLine[];
  ranAt: string;
  rowCount: number;
  totals: readonly TppSummaryLine[];
  notices: readonly string[];
}

function optionsFor(
  entity: TppReportEntity,
  options: TppReportOptions,
): readonly TppReportOption[] {
  if (entity === "event") return options.events;
  if (entity === "client") return options.clients;
  if (entity === "person") return options.people;
  if (entity === "vendor") return options.vendors;
  return options.venues;
}

function totalText(total: TppTotal): string {
  return total.kind === "money"
    ? formatTppMoney(total.value)
    : total.kind === "percentage"
      ? formatTppPercent(total.value)
      : formatTppQuantity(total.value);
}

export function tppRowCount(result: TppReportResult): number {
  return result.kind === "document"
    ? result.sections.length
    : result.kind === "labels"
      ? result.labels.length
      : result.rows.length;
}

export function tppReportSummary(
  definition: TppReportDefinition,
  request: TppReportRequest,
  result: TppReportResult,
  options: TppReportOptions,
): TppReportSummary {
  const choices: TppSummaryLine[] = [];
  for (const parameter of definition.parameters) {
    const value = request.parameters[parameter.key];
    if (parameter.type === "date_range") {
      const start = request.parameters[`${parameter.key}Start`];
      const end = request.parameters[`${parameter.key}End`];
      choices.push({
        label: parameter.label,
        value: `${formatTppDate(Number(start))} to ${formatTppDate(Number(end))}`,
      });
    } else if (parameter.type === "date") {
      choices.push({
        label: parameter.label,
        value: formatTppDate(Number(value)),
      });
    } else if (parameter.type === "boolean") {
      choices.push({ label: parameter.label, value: value ? "Yes" : "No" });
    } else {
      const picked = (
        Array.isArray(value) ? value : value ? [String(value)] : []
      ).map((id) =>
        parameter.type === "entity"
          ? (optionsFor(parameter.entity, options).find(
              (option) => option.id === id,
            )?.label ?? id)
          : parameter.type === "enum"
            ? (parameter.options.find((option) => option.value === id)?.label ??
              id)
            : id,
      );
      // An empty optional letter line is simply left out.
      if (parameter.type === "text" && picked.length === 0) continue;
      choices.push({
        label: parameter.label,
        value: picked.length ? picked.join(", ") : "Any",
      });
    }
  }
  const totals =
    result.kind === "table" || result.kind === "financial"
      ? [
          ...(result.kind === "financial" ? result.measures : []),
          ...result.totals,
        ].map((total) => ({ label: total.label, value: totalText(total) }))
      : [];
  return {
    choices,
    ranAt: formatTppDateTime(request.asOf),
    rowCount: tppRowCount(result),
    totals,
    notices: result.notices ?? [],
  };
}

/** The summary as label / value pairs, in the order every output uses. */
export function tppSummaryLines(summary: TppReportSummary): TppSummaryLine[] {
  return [
    ...summary.choices,
    { label: "Run at", value: summary.ranAt },
    { label: "Rows", value: summary.rowCount.toLocaleString("en-US") },
    ...summary.totals,
    ...summary.notices.map((notice) => ({
      label: "Missing rows",
      value: notice,
    })),
  ];
}
