/**
 * Company price rules (Organization.pricingRulesJson). Each company sets its
 * own; a company that sets none prices the plain way.
 *   - Catering minimums: the least a booking spends on food and drink, by
 *     weekday, in and out of the busy season, and a higher one for events far
 *     from the kitchen. A proposal under it shows the gap and adds a
 *     "Catering minimum" line in one tap; it never blocks the proposal.
 *   - menuPriceOptions: menus show the extra price fields (src/lib/menuPricing.ts).
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const MINIMUM_LINE_DESCRIPTION = "Catering minimum";

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
};

export const EMPTY_PRICING_RULES: PricingRules = {
  menuPriceOptions: false,
  peakSeasons: [],
  peakMinimums: [0, 0, 0, 0, 0, 0, 0],
  offPeakMinimums: [0, 0, 0, 0, 0, 0, 0],
  farAwayMinimum: 0,
  farAwayMiles: 0,
};

const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

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
      .filter((row) => MONTH_DAY.test(row.from) && MONTH_DAY.test(row.to)),
    peakMinimums: week(raw.peakMinimums),
    offPeakMinimums: week(raw.offPeakMinimums),
    farAwayMinimum: amount(raw.farAwayMinimum),
    farAwayMiles: amount(raw.farAwayMiles),
  };
}

export function hasCateringMinimums(rules: PricingRules): boolean {
  return (
    rules.farAwayMinimum > 0 ||
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
 * The minimum for an event: the far-away minimum when the event is far, else
 * the weekday minimum for its season. Null when no minimum applies.
 */
export function cateringMinimumFor(
  rules: PricingRules,
  eventDate: number | null | undefined,
  farAway: boolean,
): CateringMinimum | null {
  if (farAway && rules.farAwayMinimum > 0)
    return { amount: rules.farAwayMinimum, reason: "far from the kitchen" };
  if (typeof eventDate !== "number") return null;
  const date = new Date(eventDate);
  const peak = isPeakSeason(rules, date);
  const value = (peak ? rules.peakMinimums : rules.offPeakMinimums)[
    date.getDay()
  ];
  if (!(value > 0)) return null;
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  return {
    amount: value,
    reason:
      rules.peakSeasons.length > 0
        ? `${weekday}, ${peak ? "busy season" : "off season"}`
        : weekday,
  };
}

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
    !isMinimumLine(line)
  );
}
