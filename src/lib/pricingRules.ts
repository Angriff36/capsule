/**
 * Company price rules (Organization.pricingRulesJson). Each company sets its
 * own; a company that sets none prices the plain way.
 *   - Catering minimums: the least a booking spends on food and drink, by
 *     weekday, in and out of the busy season, and a higher one for events far
 *     from the kitchen. A proposal under it shows the gap and adds a
 *     "Catering minimum" line in one tap; it never blocks the proposal.
 *     Holidays can carry their own (higher) minimum; the highest that applies wins.
 *   - menuPriceOptions: menus show the extra price fields (src/lib/menuPricing.ts).
 *   - retainer: the fixed deposit a new payment schedule starts from.
 *   - tasting: the tasting fee per tasting guest, up to a number of guests,
 *     free once food and drink reach an amount.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MINIMUM_LINE_DESCRIPTION = "Catering minimum";

export const TASTING_LINE_DESCRIPTION = "Tasting";

/** "12-24" every year, or "2026-11-26" for one year (a moving holiday). */
export type HolidayMinimum = { date: string; label: string; amount: number };

export type TastingFeeRule = {
  perGuest: number;
  maxGuests: number;
  /** Food and drink at or above this make the tasting free; 0 = never free. */
  freeAt: number;
};

/** Month-day, "05-01". */
export type SeasonRange = { from: string; to: string };

export type PricingRules = {
  menuPriceOptions: boolean;
  /** Busy-season dates, every year. Empty = every day is off season. */
  peakSeasons: SeasonRange[];
  /** Minimum by weekday, Sunday first; 0 = none that day. */
  peakMinimums: number[];
  offPeakMinimums: number[];
  /** Any day, for an event at least farAwayMiles from the kitchen. */
  farAwayMinimum: number;
  farAwayMiles: number;
  /** Far away also by drive time, one way; 0 = miles only. */
  farAwayHours: number;
  holidays: HolidayMinimum[];
  /** Fixed deposit a new payment schedule starts from; 0 = none. */
  retainer: number;
  tasting: TastingFeeRule;
};

export const EMPTY_PRICING_RULES: PricingRules = {
  menuPriceOptions: false,
  peakSeasons: [],
  peakMinimums: [0, 0, 0, 0, 0, 0, 0],
  offPeakMinimums: [0, 0, 0, 0, 0, 0, 0],
  farAwayMinimum: 0,
  farAwayMiles: 0,
  farAwayHours: 0,
  holidays: [],
  retainer: 0,
  tasting: { perGuest: 0, maxGuests: 0, freeAt: 0 },
};

/** Days in a month; a year-less date allows Feb 29 (it happens in leap years). */
const daysInMonth = (month: number, year = 2000) =>
  new Date(year, month, 0).getDate();

const pad = (value: number) => String(value).padStart(2, "0");

/** "5-1" or "05-01" → "05-01"; a day the month does not have ("04-31") → null. */
export function parseMonthDay(value: string): string | null {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month))
    return null;
  return `${pad(month)}-${pad(day)}`;
}

/**
 * A holiday date: "12-24" every year or "2026-11-26" one year, padded. A date
 * the calendar does not have ("02-31", "2027-02-29") → null.
 */
export function parseHolidayDate(value: string): string | null {
  const match = /^(?:(\d{4})-)?(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) return null;
  if (!match[1]) return parseMonthDay(`${match[2]}-${match[3]}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month, year))
    return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const amount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const week = (value: unknown) =>
  WEEKDAYS.map((_, day) => amount(Array.isArray(value) ? value[day] : 0));

export function readPricingRules(
  organization: { pricingRulesJson?: string | null } | null | undefined,
): PricingRules {
  const json = organization?.pricingRulesJson;
  if (!json) return EMPTY_PRICING_RULES;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return EMPTY_PRICING_RULES;
    raw = parsed as Record<string, unknown>;
  } catch {
    return EMPTY_PRICING_RULES;
  }
  return {
    menuPriceOptions: raw.menuPriceOptions === true,
    peakSeasons: (Array.isArray(raw.peakSeasons) ? raw.peakSeasons : [])
      .map((row) => ({
        from: String((row as SeasonRange | null)?.from ?? ""),
        to: String((row as SeasonRange | null)?.to ?? ""),
      }))
      .map((row) => ({
        from: parseMonthDay(row.from) ?? "",
        to: parseMonthDay(row.to) ?? "",
      }))
      .filter((row) => row.from && row.to),
    peakMinimums: week(raw.peakMinimums),
    offPeakMinimums: week(raw.offPeakMinimums),
    farAwayMinimum: amount(raw.farAwayMinimum),
    farAwayMiles: amount(raw.farAwayMiles),
    farAwayHours: amount(raw.farAwayHours),
    holidays: (Array.isArray(raw.holidays) ? raw.holidays : [])
      .map((row) => {
        const item = (row ?? {}) as Record<string, unknown>;
        return {
          date: parseHolidayDate(String(item.date ?? "")) ?? "",
          label: typeof item.label === "string" ? item.label.trim() : "",
          amount: amount(item.amount),
        };
      })
      .filter((row) => row.date && row.amount > 0),
    retainer: amount(raw.retainer),
    tasting: (() => {
      const item = (raw.tasting ?? {}) as Record<string, unknown>;
      return {
        perGuest: amount(item.perGuest),
        maxGuests: Math.round(amount(item.maxGuests)),
        freeAt: amount(item.freeAt),
      };
    })(),
  };
}

export function hasCateringMinimums(rules: PricingRules): boolean {
  return (
    rules.farAwayMinimum > 0 ||
    rules.holidays.length > 0 ||
    rules.peakMinimums.some((value) => value > 0) ||
    rules.offPeakMinimums.some((value) => value > 0)
  );
}

/** "05-01" → "May 1". */
export function monthDayText(value: string): string {
  const [month, day] = value.split("-").map(Number);
  return new Date(2000, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

const monthDayOf = (date: Date) =>
  `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** True when the date falls in a busy-season range (a range may wrap the new year). */
export function isPeakSeason(rules: PricingRules, date: Date): boolean {
  const day = monthDayOf(date);
  return rules.peakSeasons.some((range) =>
    range.from <= range.to
      ? day >= range.from && day <= range.to
      : day >= range.from || day <= range.to,
  );
}

export type CateringMinimum = { amount: number; reason: string };

/**
 * The minimum for an event: the highest of its weekday minimum for the
 * season, a holiday minimum on its date, and the far-away minimum when the
 * event is far. Null when none applies.
 */
export function cateringMinimumFor(
  rules: PricingRules,
  eventDate: number | null | undefined,
  farAway: boolean,
): CateringMinimum | null {
  const options: CateringMinimum[] = [];
  if (farAway && rules.farAwayMinimum > 0)
    options.push({
      amount: rules.farAwayMinimum,
      reason: "far from the kitchen",
    });
  if (typeof eventDate === "number") {
    const date = new Date(eventDate);
    const peak = isPeakSeason(rules, date);
    const value = (peak ? rules.peakMinimums : rules.offPeakMinimums)[
      date.getDay()
    ];
    const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
    if (value > 0)
      options.push({
        amount: value,
        reason:
          rules.peakSeasons.length > 0
            ? `${weekday}, ${peak ? "busy season" : "off season"}`
            : weekday,
      });
    const monthDay = monthDayOf(date);
    const fullDay = `${date.getFullYear()}-${monthDay}`;
    for (const holiday of rules.holidays)
      if (holiday.date === monthDay || holiday.date === fullDay)
        options.push({
          amount: holiday.amount,
          reason: holiday.label || "holiday",
        });
  }
  return options.reduce<CateringMinimum | null>(
    (best, next) => (best == null || next.amount > best.amount ? next : best),
    null,
  );
}

/** True when the event counts as far: by miles or by drive time. */
export function isFarAway(
  rules: PricingRules,
  miles: number | null,
  driveMinutes: number | null,
): boolean {
  return (
    (rules.farAwayMiles > 0 && miles != null && miles >= rules.farAwayMiles) ||
    (rules.farAwayHours > 0 &&
      driveMinutes != null &&
      driveMinutes >= rules.farAwayHours * 60)
  );
}

/** The tasting fee for a number of tasting guests and the food-and-drink total. */
export function tastingFeeFor(
  rules: PricingRules,
  tastingGuests: number,
  foodTotal: number,
): number {
  const rule = rules.tasting;
  if (!(rule.perGuest > 0) || !(tastingGuests > 0)) return 0;
  if (rule.freeAt > 0 && foodTotal >= rule.freeAt) return 0;
  const guests =
    rule.maxGuests > 0
      ? Math.min(tastingGuests, rule.maxGuests)
      : tastingGuests;
  return Math.round(rule.perGuest * guests * 100) / 100;
}

export const isTastingLine = (line: { description?: string | null }) =>
  (line.description ?? "").startsWith(`${TASTING_LINE_DESCRIPTION} (`);

type MinimumLine = {
  description?: string | null;
  pricingBasis?: string | null;
  equipmentId?: string | null;
  feeAppliesTo?: string | null;
  travelFee?: boolean | null;
};

export const isMinimumLine = (line: MinimumLine) =>
  (line.description ?? "").startsWith(MINIMUM_LINE_DESCRIPTION);

/**
 * Whether a line is food or drink, the part a catering minimum counts:
 * not a percent, a fee on part of the bill, a rental, staff, travel, or the
 * minimum line itself.
 */
export function countsTowardMinimum(line: MinimumLine): boolean {
  return (
    line.pricingBasis !== "percentage" &&
    !line.feeAppliesTo &&
    !line.equipmentId &&
    !line.travelFee &&
    !(line.description ?? "").startsWith("Staff:") &&
    !isMinimumLine(line) &&
    !isTastingLine(line)
  );
}
