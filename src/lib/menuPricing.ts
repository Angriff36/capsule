/**
 * Extra price rules on one menu (Menu.pricingOptionsJson), for menus priced
 * the way a printed menu book prices them:
 *   - a per-guest price range: "$4.50–6 per guest" (pricePerPerson to priceTo);
 *   - named price choices: "$51 · pick 1 protein", "$67 · full portions of both";
 *   - add-ons: "Jidori chicken upgrade +$10" per guest, "Gluten-free dough +$5"
 *     per pizza;
 *   - a price table by count: "feeds up to 30: $930, up to 50: $1,450";
 *   - a smallest spend on the menu: "host guarantees a $1,500 minimum";
 *   - units per guests: "one station serves about 50 guests".
 * A price choice can apply by itself: when a number of dishes is picked from
 * a course ("full portions of both" = 2 entrées), or when one of its dishes is
 * picked (a plated tier: the highest tier picked sets the price).
 * A company turns the menu fields on in its price rules (src/lib/pricingRules.ts);
 * a menu with none of these prices the plain way.
 */

export type MenuPriceChoice = {
  label: string;
  pricePerPerson: number;
  /** Applies when this many dishes of `course` are picked. */
  course?: string;
  picks?: number;
  /** Applies when any of these dishes is picked (a tier). */
  dishIds?: string[];
};

export type MenuMinimumSpend = { amount: number; label: string };

export type MenuUnitsPer = { guests: number; unit: string };

/** "guest" = charged for every guest; any other word ("pizza") = per one of those. */
export type MenuAddOn = { label: string; price: number; per: string };

export type MenuPriceStep = { upTo: number; price: number };

export type MenuPricingOptions = {
  /** Top of the per-guest range; the menu's per-guest price is the bottom. */
  priceTo: number | null;
  choices: MenuPriceChoice[];
  addOns: MenuAddOn[];
  /** What the price table counts: "guests", "pizzas". */
  countUnit: string;
  /** Price by count, smallest first. A count between steps takes the next one up. */
  steps: MenuPriceStep[];
  minimumSpend: MenuMinimumSpend | null;
  unitsPer: MenuUnitsPer | null;
};

export const EMPTY_MENU_PRICING: MenuPricingOptions = {
  priceTo: null,
  choices: [],
  addOns: [],
  countUnit: "guests",
  steps: [],
  minimumSpend: null,
  unitsPer: null,
};

const positive = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          row != null && typeof row === "object",
      )
    : [];

/** The menu's extra price rules; bad or missing parts read as empty. */
export function readMenuPricingOptions(
  menu: { pricingOptionsJson?: string | null } | null | undefined,
): MenuPricingOptions {
  const json = menu?.pricingOptionsJson;
  if (!json) return EMPTY_MENU_PRICING;
  let raw: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return EMPTY_MENU_PRICING;
    raw = parsed as Record<string, unknown>;
  } catch {
    return EMPTY_MENU_PRICING;
  }
  return {
    priceTo: positive(raw.priceTo),
    choices: rows(raw.choices)
      .map((row): MenuPriceChoice => {
        const choice: MenuPriceChoice = {
          label: text(row.label),
          pricePerPerson: positive(row.pricePerPerson) ?? 0,
        };
        const picks = Math.round(positive(row.picks) ?? 0);
        if (text(row.course) && picks > 0) {
          choice.course = text(row.course);
          choice.picks = picks;
        }
        const dishIds = Array.isArray(row.dishIds)
          ? row.dishIds.filter((id): id is string => typeof id === "string")
          : [];
        if (dishIds.length > 0) choice.dishIds = dishIds;
        return choice;
      })
      .filter((row) => row.label && row.pricePerPerson > 0),
    addOns: rows(raw.addOns)
      .map((row) => ({
        label: text(row.label),
        price: positive(row.price) ?? 0,
        per: text(row.per).toLowerCase() || "guest",
      }))
      .filter((row) => row.label && row.price > 0),
    countUnit: text(raw.countUnit) || "guests",
    steps: rows(raw.steps)
      .map((row) => ({
        upTo: Math.round(positive(row.upTo) ?? 0),
        price: positive(row.price) ?? 0,
      }))
      .filter((row) => row.upTo > 0 && row.price > 0)
      .sort((a, b) => a.upTo - b.upTo),
    minimumSpend: (() => {
      const row = (raw.minimumSpend ?? {}) as Record<string, unknown>;
      const amount = positive(row.amount);
      return amount ? { amount, label: text(row.label) || "Minimum" } : null;
    })(),
    unitsPer: (() => {
      const row = (raw.unitsPer ?? {}) as Record<string, unknown>;
      const guests = Math.round(positive(row.guests) ?? 0);
      return guests > 0 ? { guests, unit: text(row.unit) || "station" } : null;
    })(),
  };
}

export function hasMenuPricingOptions(options: MenuPricingOptions): boolean {
  return (
    options.priceTo != null ||
    options.choices.length > 0 ||
    options.addOns.length > 0 ||
    options.steps.length > 0 ||
    options.minimumSpend != null ||
    options.unitsPer != null
  );
}

/** A picked dish of this menu: its dish and course. */
export type PickedDish = { dishId: string; course: string | null };

const sameCourse = (a: string | null | undefined, b: string) =>
  (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The price choice the picks call for, or null when no choice applies by
 * itself. Every choice whose rule the picks meet counts; the highest price
 * wins ("your highest entrée tier sets one price per guest").
 */
export function choiceForPicks(
  options: MenuPricingOptions,
  picked: readonly PickedDish[],
): MenuPriceChoice | null {
  const ids = new Set(picked.map((row) => row.dishId));
  const met = options.choices.filter((choice) => {
    if (choice.dishIds?.some((id) => ids.has(id))) return true;
    if (choice.course && choice.picks != null)
      return (
        picked.filter((row) => sameCourse(row.course, choice.course!))
          .length === choice.picks
      );
    return false;
  });
  return met.reduce<MenuPriceChoice | null>(
    (best, choice) =>
      best == null || choice.pricePerPerson > best.pricePerPerson
        ? choice
        : best,
    null,
  );
}

/** True when some choice applies by itself (by picks or by dish). */
export function hasAutomaticChoices(options: MenuPricingOptions): boolean {
  return options.choices.some(
    (choice) => (choice.dishIds?.length ?? 0) > 0 || choice.picks != null,
  );
}

/** The per-guest line name for a choice ("" = the menu's own price). */
export function perGuestLineDescription(menuName: string, label: string) {
  return label
    ? `${menuName} (per guest) — ${label}`
    : `${menuName} (per guest)`;
}

/** "3 stations for 140 guests"; null without a rule or guests. */
export function unitsForGuests(
  options: MenuPricingOptions,
  guestCount: number,
): string | null {
  if (!options.unitsPer || !(guestCount > 0)) return null;
  const count = Math.ceil(guestCount / options.unitsPer.guests);
  return `${count} ${options.unitsPer.unit}${count === 1 ? "" : "s"} for ${guestCount} guests`;
}

/**
 * The price-table step for a count: the smallest step that holds it ("we'll
 * size you up to the next batch"). Null when the count is above the table.
 */
export function priceStepFor(
  options: MenuPricingOptions,
  count: number,
): MenuPriceStep | null {
  if (!(count > 0)) return null;
  return options.steps.find((step) => count <= step.upTo) ?? null;
}

const money = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;

/** "$4.50–$6 per guest" or "$41 per guest"; null without a per-guest price. */
export function perGuestPriceText(
  pricePerPerson: number,
  options: MenuPricingOptions,
): string | null {
  if (!(pricePerPerson > 0)) return null;
  return options.priceTo != null && options.priceTo > pricePerPerson
    ? `${money(pricePerPerson)}–${money(options.priceTo)} per guest`
    : `${money(pricePerPerson)} per guest`;
}

export function addOnText(addOn: MenuAddOn): string {
  return `${addOn.label} +${money(addOn.price)} per ${addOn.per}`;
}

export const menuMoney = money;
