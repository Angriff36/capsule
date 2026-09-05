/**
 * Pure interpretation of stored xlsx values.
 *
 * The typed reader records a NAMED OUTCOME for every condition the import
 * spec calls out (PR01-06 / AC-025): 1900/1904 date systems, the phantom
 * 1900 leap day, fractional-day times, accounting parentheses, fractions.
 * Nothing is silently coerced — a value that cannot be interpreted keeps a
 * named outcome instead of a guess.
 *
 * Units come only from a cell's own number-format literal (e.g. 0.00" lbs").
 * They are never inferred from neighboring cells: issue #274 confirmed TPP
 * custom formats are text, date and decimal only, so a missing unit is lost
 * in the source, not something a reader can recover.
 */

/** Bumped when interpretation rules change; persisted with provenance. */
export const XLSX_PARSER_VERSION = "xlsx-interpreted-1";

/**
 * Interpreted date/time values stay naive-local: serials carry no zone, so
 * values render as wall-clock time and are never converted (the same
 * convention as parseReportDate in reportValues.ts).
 */
export const XLSX_TIMEZONE_ASSUMPTION =
  "Excel serials carry no time zone; values are read as naive local wall-clock time and never converted.";

export type XlsxDateSystem = "1900" | "1904";

export interface SerialInterpretation {
  /** "YYYY-MM-DD"; absent when the serial encodes time only. */
  date?: string;
  /** "HH:MM:SS"; absent when the serial carries no time part. */
  time?: string;
  outcome?: "phantom_leap_day_1900" | "serial_before_epoch";
}

const MS_PER_DAY = 86_400_000;
const SECONDS_PER_DAY = 86_400;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIsoDate(daysSinceEpoch: number): string {
  const date = new Date(daysSinceEpoch * MS_PER_DAY);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Clock string from total seconds; hours may exceed 24 for elapsed times. */
function formatClockSeconds(totalSeconds: number): string {
  return `${pad2(Math.floor(totalSeconds / 3600))}:${pad2(
    Math.floor((totalSeconds % 3600) / 60),
  )}:${pad2(totalSeconds % 60)}`;
}

/** Clock string for a serial's time part; hours may exceed 24 when elapsed. */
export function formatSerialClock(serial: number): string {
  return formatClockSeconds(Math.round(serial * SECONDS_PER_DAY));
}

/**
 * Interpret an Excel date serial.
 *
 * 1900 system: serial 1 = 1900-01-01, and serial 60 is the phantom
 * 1900-02-29 Excel inherited from Lotus 1-2-3 — it is reported by name,
 * never mapped onto a real date. Serials below 1 carry time only
 * ("January 0"). 1904 system: serial 0 = 1904-01-01, no phantom day.
 */
export function interpretSerial(
  serial: number,
  system: XlsxDateSystem,
): SerialInterpretation {
  if (!Number.isFinite(serial) || serial < 0) {
    return { outcome: "serial_before_epoch" };
  }
  if (system === "1900") {
    if (serial >= 60 && serial < 61) {
      return { outcome: "phantom_leap_day_1900" };
    }
    if (serial < 1) return { time: formatSerialClock(serial) };
  }
  const wholeDays = Math.floor(serial);
  // 1900-system serials below 60 count from 1899-12-31; from 61 up, the
  // phantom day is subtracted so both halves count from 1899-12-30.
  const utcDays =
    system === "1900"
      ? wholeDays < 60
        ? wholeDays - 25568
        : wholeDays - 25569
      : wholeDays - 24107;
  let seconds = Math.round((serial - wholeDays) * SECONDS_PER_DAY);
  let days = utcDays;
  if (seconds >= SECONDS_PER_DAY) {
    seconds -= SECONDS_PER_DAY;
    days += 1;
  }
  const interpretation: SerialInterpretation = { date: formatIsoDate(days) };
  if (serial % 1 !== 0 || seconds > 0) {
    interpretation.time = formatClockSeconds(seconds);
  }
  return interpretation;
}

export type NumFmtKind =
  "general" | "text" | "number" | "date" | "time" | "fraction" | "accounting";

export interface NumFmtClass {
  kind: NumFmtKind;
  unit: string | null;
}

/** Builtin format ids every writer shares; custom ids start at 164. */
export const BUILTIN_NUM_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  12: "# ?/?",
  13: "# ??/??",
  14: "m/d/yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "m/d/yyyy h:mm",
  37: "#,##0 ;(#,##0)",
  38: "#,##0 ;[Red](#,##0)",
  39: "#,##0.00;(#,##0.00)",
  40: "#,##0.00;[Red](#,##0.00)",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mmss.0",
  48: "##0.0E+0",
  49: "@",
};

/** Remove quoted literals, escaped characters and non-elapsed bracket groups. */
function stripFormatLiterals(code: string): string {
  return code
    .replace(/"(?:[^"]|"")*"/g, "")
    .replace(/\\./g, "")
    .replace(/\[([^\]]*)\]/g, (_, body: string) =>
      /^[hms]+$/i.test(body) ? body.toLowerCase() : "",
    );
}

/** A quoted literal after the last numeric token is a unit: 0.00" lbs". */
function unitLiteral(positiveSection: string): string | null {
  const literals = [...positiveSection.matchAll(/"([^"]*)"/g)];
  if (literals.length === 0) return null;
  let lastNumericIndex = -1;
  for (let index = 0; index < positiveSection.length; index += 1) {
    if (/[0#?]/.test(positiveSection[index]!)) lastNumericIndex = index;
  }
  const trailing = literals.filter(
    (match) => (match.index ?? 0) > lastNumericIndex,
  );
  const unit = trailing.at(-1)?.[1]?.trim();
  return unit && unit.length > 0 ? unit : null;
}

/** Classify a number-format code into the interpretation the reader applies. */
export function classifyNumFmtCode(code: string): NumFmtClass {
  const trimmed = code.trim();
  if (trimmed === "" || /^general$/i.test(trimmed)) {
    return { kind: "general", unit: null };
  }
  const sections = trimmed.split(";");
  const positive = sections[0] ?? trimmed;
  if (stripFormatLiterals(positive) === "@") {
    return { kind: "text", unit: null };
  }
  const body = stripFormatLiterals(positive);
  const hasTime = /[hs]/i.test(body);
  const monthToken = /(?:^|[^hms])m+(?:$|[^hms])/i.test(body);
  const hasDate = /[dy]/i.test(body) || (monthToken && !hasTime);
  const parens = sections
    .slice(1)
    .some((section) => /[()]/.test(stripFormatLiterals(section)));
  let kind: NumFmtKind;
  if (hasDate) kind = "date";
  else if (hasTime) kind = "time";
  else if (/[?#]\s*\/\s*[?#0]/.test(body)) kind = "fraction";
  else if (parens) kind = "accounting";
  else kind = "number";
  return { kind, unit: unitLiteral(positive) };
}

/** "(1,234.50)" / "($25.00)" → -1234.5 / -25; null when the text is not one. */
export function parseAccountingParenthesesText(text: string): number | null {
  const match = text.trim().match(/^\(\s*[£$€¥]?\s*([\d,]+(?:\.\d+)?)\s*\)$/);
  if (match === null) return null;
  const magnitude = Number(match[1]!.replace(/,/g, ""));
  return Number.isFinite(magnitude) ? -magnitude : null;
}

/** "3 1/2" → 3.5, "1/2" → 0.5, "-3 1/2" → -3.5; null when not a fraction. */
export function parseFractionText(text: string): number | null {
  const value = text.trim();
  const mixed = value.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed !== null) {
    const whole = Number(mixed[1]);
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    const sign = whole < 0 ? -1 : 1;
    const fraction = Number(mixed[2]) / denominator;
    return sign * (Math.abs(whole) + fraction);
  }
  const simple = value.match(/^(-?)\s*(\d+)\s*\/\s*(\d+)$/);
  if (simple !== null) {
    const denominator = Number(simple[3]);
    if (denominator === 0) return null;
    return (simple[1] === "-" ? -1 : 1) * (Number(simple[2]) / denominator);
  }
  return null;
}

/** "1,234.50" / "$12.00" → number; null when the text is not numeric. */
export function parseLooseNumberText(text: string): number | null {
  const match = text.trim().match(/^[£$€¥]?\s*(-?[\d,]+(?:\.\d+)?)$/);
  if (match === null) return null;
  const value = Number(match[1]!.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}
