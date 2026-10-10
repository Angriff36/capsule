export type NaturalDateKind = "date" | "datetime";

export type NaturalDateParseResult =
  | { ok: true; value: string; echo: string }
  | { ok: false; reason: "empty" | "unparseable" };

export type NaturalDateOptions = {
  kind: NaturalDateKind;
  anchor?: string;
  now?: Date;
  direction?: "future" | "any";
  defaultTime?: readonly [number, number];
};

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].flatMap((month, index) => [
    [month, index] as const,
    // Short forms: "oct", "sept", "dec".
    [month.slice(0, 3), index] as const,
    ...(month === "september" ? [["sept", index] as const] : []),
  ]),
);
const WEEKDAYS = new Map(
  [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].map((weekday, index) => [weekday, index]),
);

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateValue(value: Date) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function localDateTimeValue(value: Date) {
  return `${localDateValue(value)}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function addLocalDateTimeHours(value: string, hours: number) {
  const date = localDateFromValue(value);
  if (!date) return "";
  date.setHours(date.getHours() + hours);
  return localDateTimeValue(date);
}

function localDateFromValue(value: string | undefined) {
  if (!value) return undefined;
  // Callers lower-case typed text, so accept "t" as well as "T".
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2}))?$/,
  );
  if (!match) return undefined;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function validLocalDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
) {
  const date = new Date(year, month, day, hour, minute);
  return date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
    ? date
    : undefined;
}

function withDefaultTime(
  value: Date,
  options: NaturalDateOptions,
  explicitTime?: readonly [number, number],
  preserveTime = false,
) {
  if (options.kind === "date") return value;
  if (preserveTime && !explicitTime) return value;
  const [hour, minute] = explicitTime ?? options.defaultTime ?? [9, 0];
  value.setHours(hour, minute, 0, 0);
  return value;
}

function parseTime(
  raw: string | undefined,
): readonly [number, number] | undefined {
  if (!raw) return undefined;
  const clock = raw.trim().match(/^(?:at\s+)?(\d{1,2}):(\d{2})$/);
  if (clock) {
    // 24-hour time such as "18:00".
    const hour = Number(clock[1]);
    const minute = Number(clock[2]);
    return hour <= 23 && minute <= 59 ? ([hour, minute] as const) : undefined;
  }
  const match = raw
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) return undefined;
  const initialHour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  if (initialHour < 1 || initialHour > 12 || minute > 59) return undefined;
  return [(initialHour % 12) + (match[3] === "pm" ? 12 : 0), minute];
}

function echo(value: Date, kind: NaturalDateKind) {
  const date = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
  if (kind === "date") return date;
  return `${date} · ${new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(value)}`;
}

function nextWeekday(now: Date, weekday: number, nextWeek: boolean) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  if (nextWeek) {
    // That weekday in the following Monday-to-Sunday week: on a Saturday,
    // "next Wednesday" is four days away, not eleven.
    const intoWeek = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - intoWeek + 7 + ((weekday + 6) % 7));
    return date;
  }
  date.setDate(date.getDate() + ((weekday - date.getDay() + 7) % 7));
  return date;
}

/** Parses complete, operator-facing phrases in the browser's local time zone.
 * `next Friday` always means Friday in the following calendar week; bare
 * `Friday` means the coming Friday (including today). */
export function parseNaturalDate(
  input: string,
  options: NaturalDateOptions,
): NaturalDateParseResult {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return { ok: false, reason: "empty" };
  const now = options.now ? new Date(options.now) : new Date();
  const anchor = localDateFromValue(options.anchor) ?? now;
  let value: Date | undefined;
  let explicitTime: readonly [number, number] | undefined;
  let preserveTime = false;

  const iso = localDateFromValue(text);
  if (iso) {
    value = iso;
    // A stored date-time keeps its own time instead of the 9:00 default.
    preserveTime = /\d[t ]\d/.test(text);
  }

  const relative = text.match(
    /^(?:in\s+|\+)(\d+)\s*(h|hours?|d|days?|w|weeks?)$/,
  );
  if (!value && relative) {
    value = new Date(anchor);
    preserveTime = true;
    const amount = Number(relative[1]);
    const unit = relative[2];
    if (unit.startsWith("h")) value.setHours(value.getHours() + amount);
    else if (unit.startsWith("d")) value.setDate(value.getDate() + amount);
    else value.setDate(value.getDate() + amount * 7);
  }

  const simple = text.match(/^(today|tomorrow|yesterday)(?:\s+(.+))?$/);
  if (!value && simple) {
    value = new Date(now);
    value.setHours(0, 0, 0, 0);
    if (simple[1] === "tomorrow") value.setDate(value.getDate() + 1);
    if (simple[1] === "yesterday") value.setDate(value.getDate() - 1);
    explicitTime = parseTime(simple[2]);
    if (simple[2] && !explicitTime) return { ok: false, reason: "unparseable" };
  }

  const weekday = text.match(
    /^(next\s+)?(sun|mon|tue|wed|thu|fri|sat)(?:day|sday|nesday|rsday|urday|s|rs|ur|n)?(?:\s+(.+))?$/,
  );
  if (!value && weekday) {
    // "fri", "thurs" and "friday" all name the same day.
    const day = [...WEEKDAYS].find(([name]) => name.startsWith(weekday[2]));
    value = nextWeekday(now, day![1], Boolean(weekday[1]));
    explicitTime = parseTime(weekday[3]);
    if (weekday[3] && !explicitTime)
      return { ok: false, reason: "unparseable" };
  }

  const numeric = text.match(
    /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(.+))?$/,
  );
  const named = text.match(
    /^(?:(\p{L}+)\s+(\d{1,2})|(\d{1,2})\s+(\p{L}+))(?:,?\s+(\d{4}))?(?:\s+(.+))?$/u,
  );
  if (!value && (numeric || named)) {
    const month = numeric
      ? Number(numeric[1]) - 1
      : MONTHS.get((named![1] ?? named![4]).toLowerCase());
    const day = numeric ? Number(numeric[2]) : Number(named![2] ?? named![3]);
    const yearText = numeric?.[3] ?? named?.[5];
    const timeText = numeric?.[4] ?? named?.[6];
    if (month === undefined || month < 0 || month > 11)
      return { ok: false, reason: "unparseable" };
    let year = yearText
      ? Number(yearText.length === 2 ? `20${yearText}` : yearText)
      : now.getFullYear();
    explicitTime = parseTime(timeText);
    if (timeText && !explicitTime) return { ok: false, reason: "unparseable" };
    value = validLocalDate(year, month, day);
    if (
      value &&
      options.direction !== "any" &&
      !yearText &&
      value < new Date(now.getFullYear(), now.getMonth(), now.getDate())
    ) {
      value = validLocalDate(year + 1, month, day);
    }
  }

  if (!value) {
    // A bare time is meaningful for an end field anchored to a start date.
    explicitTime = parseTime(text);
    if (explicitTime && options.anchor) {
      value = new Date(anchor);
      value.setHours(explicitTime[0], explicitTime[1], 0, 0);
      if (value < anchor) value.setDate(value.getDate() + 1);
    }
  }

  if (!value) return { ok: false, reason: "unparseable" };
  value = withDefaultTime(value, options, explicitTime, preserveTime);
  return {
    ok: true,
    value:
      options.kind === "date"
        ? localDateValue(value)
        : localDateTimeValue(value),
    echo: echo(value, options.kind),
  };
}
