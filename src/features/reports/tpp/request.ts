import type {
  TppReportDefinition,
  TppReportParameter,
  TppReportRequest,
} from "./types";

export type TppRequestParseResult =
  | { ok: true; request: TppReportRequest }
  | { ok: false; errors: Readonly<Record<string, string>> };

const DAY_MS = 86_400_000;

function localDay(value: Date): number {
  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate(),
  ).getTime();
}

function dateDefault(
  value: "today" | "month_start" | "month_end",
  now: Date,
): number {
  if (value === "month_start") {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  if (value === "month_end") {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
  }
  return localDay(now);
}

function rangeDefault(
  value: "today" | "this_week" | "this_month",
  now: Date,
): [number, number] {
  const today = localDay(now);
  if (value === "today") return [today, today + DAY_MS - 1];
  if (value === "this_week") {
    const mondayOffset = (now.getDay() + 6) % 7;
    const start = today - mondayOffset * DAY_MS;
    return [start, start + 7 * DAY_MS - 1];
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime() - 1;
  return [start, end];
}

function parseDate(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const parsed = new Date(`${raw}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function requiredMessage(parameter: TppReportParameter): string {
  return `Choose ${parameter.label.toLowerCase()}.`;
}

export function parseTppReportRequest(
  definition: TppReportDefinition,
  formData: FormData,
  now = new Date(),
  currentEventId?: string,
): TppRequestParseResult {
  const parameters: Record<string, string | string[] | boolean | number> = {};
  const errors: Record<string, string> = {};

  for (const parameter of definition.parameters) {
    if (parameter.type === "boolean") {
      parameters[parameter.key] = formData.has(parameter.key);
      continue;
    }
    if (parameter.type === "date_range") {
      const fallback = rangeDefault(parameter.default, now);
      const start =
        parseDate(formData.get(`${parameter.key}Start`)) ?? fallback[0];
      const endDay =
        parseDate(formData.get(`${parameter.key}End`)) ?? fallback[1];
      const end = endDay === fallback[1] ? endDay : endDay + DAY_MS - 1;
      if (start > end)
        errors[parameter.key] = "Start date must be before end date.";
      parameters[`${parameter.key}Start`] = start;
      parameters[`${parameter.key}End`] = end;
      continue;
    }
    if (parameter.type === "date") {
      const raw = parseDate(formData.get(parameter.key));
      parameters[parameter.key] = raw ?? dateDefault(parameter.default, now);
      continue;
    }

    const multiple = "multiple" in parameter && parameter.multiple;
    const selected = multiple
      ? formData
          .getAll(parameter.key)
          .filter(
            (value): value is string => typeof value === "string" && !!value,
          )
      : String(formData.get(parameter.key) ?? "").trim();
    const fallbackEvent =
      parameter.type === "entity" &&
      parameter.entity === "event" &&
      !selected &&
      currentEventId
        ? currentEventId
        : selected;
    if (parameter.required && (!fallbackEvent || fallbackEvent.length === 0)) {
      errors[parameter.key] = requiredMessage(parameter);
    } else if (fallbackEvent && fallbackEvent.length > 0) {
      parameters[parameter.key] = fallbackEvent;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    request: { reportId: definition.id, parameters, asOf: now.getTime() },
  };
}
