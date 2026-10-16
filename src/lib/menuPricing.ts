/**
 * Extra price rules on one menu (Menu.pricingOptionsJson), for menus priced
 * the way a printed menu book prices them:
 *   - a per-guest price range: "$4.50–6 per guest" (pricePerPerson to priceTo);
 *   - named price choices: "$51 · pick 1 protein", "$67 · full portions of both";
 *   - add-ons: "Jidori chicken upgrade +$10" per guest, "Gluten-free dough +$5"
 *     per pizza;
 *   - a price table by count: "feeds up to 30: $930, up to 50: $1,450".
 * A company turns the menu fields on in its price rules (src/lib/pricingRules.ts);
 * a menu with none of these prices the plain way.
 */

export type MenuPriceChoice = { label: string; pricePerPerson: number };

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
};

export const EMPTY_MENU_PRICING: MenuPricingOptions = {
  priceTo: null,
  choices: [],
  addOns: [],
  countUnit: "guests",
  steps: [],
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
      .map((row) => ({
        label: text(row.label),
        pricePerPerson: positive(row.pricePerPerson) ?? 0,
      }))
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
  };
}

export function hasMenuPricingOptions(options: MenuPricingOptions): boolean {
  return (
    options.priceTo != null ||
    options.choices.length > 0 ||
    options.addOns.length > 0 ||
    options.steps.length > 0
  );
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
