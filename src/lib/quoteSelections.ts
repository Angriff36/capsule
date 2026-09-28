// Structured quote-form picks and the estimate built from them (spec CF-4-3).
// Pure — no database access — so the Convex seam (convex/lib/quoteSelections)
// and the review screen share one shape and one price calculation.
//
// A pick is a dish from the chosen menu; an extra is a dish from another
// published menu the visitor wants on top. A quantity of null means "one for
// every guest", so the line follows the guest count like any per-person line.

import { formatMoneyExact } from "./format";
import { computeProposalPricing, type PricingBasis } from "./pricing";

export type QuoteSelectionKind = "menu" | "extra";

export interface QuoteSelectionLine {
  kind: QuoteSelectionKind;
  menuId: string;
  menuDishId: string;
  dishId: string;
  name: string;
  /** Portions asked for; null = one for every guest. */
  quantity: number | null;
  /** Catalog sell price in force; null = priced in the proposal. */
  unitPrice: number | null;
}

export interface QuoteMenuTerms {
  menuId: string;
  name: string;
  basePrice: number;
  pricePerPerson: number;
}

export interface QuoteSelections {
  menu: QuoteMenuTerms | null;
  lines: QuoteSelectionLine[];
}

export interface QuoteProposalLine {
  description: string;
  pricingBasis: PricingBasis;
  unitPrice: number;
  quantity?: number;
  menuDishId?: string;
}

export interface QuoteEnhancementOffer {
  menuDishId: string;
  name: string;
  description: string;
  price: number;
}

/**
 * The draft proposal's priced lines and offered extras for these picks. A
 * menu with its own price is quoted at that price (the picks are the
 * client's dish choices inside it); otherwise each priced pick is a line
 * linked to its catalog row. Extras become offered enhancements, priced at
 * the catalog price for the portions asked for.
 */
export function quoteProposalPlan(
  selections: QuoteSelections,
  guestCount: number,
): { lines: QuoteProposalLine[]; enhancements: QuoteEnhancementOffer[] } {
  const lines: QuoteProposalLine[] = [];
  const menu = selections.menu;
  if (menu && (menu.basePrice > 0 || menu.pricePerPerson > 0)) {
    if (menu.pricePerPerson > 0) {
      lines.push({
        description: `${menu.name} (per person)`,
        pricingBasis: "per_person",
        unitPrice: menu.pricePerPerson,
      });
    }
    if (menu.basePrice > 0) {
      lines.push({
        description: `${menu.name} (base fee)`,
        pricingBasis: "flat",
        unitPrice: menu.basePrice,
      });
    }
  } else {
    for (const pick of selections.lines) {
      if (pick.kind !== "menu" || pick.unitPrice == null) continue;
      lines.push(
        pick.quantity == null
          ? {
              description: pick.name,
              pricingBasis: "per_person",
              unitPrice: pick.unitPrice,
              menuDishId: pick.menuDishId,
            }
          : {
              description: pick.name,
              pricingBasis: "per_unit",
              unitPrice: pick.unitPrice,
              quantity: pick.quantity,
              menuDishId: pick.menuDishId,
            },
      );
    }
  }

  const enhancements = selections.lines
    .filter((line) => line.kind === "extra")
    .map((extra): QuoteEnhancementOffer => {
      const portions = extra.quantity ?? guestCount;
      if (extra.unitPrice == null) {
        return {
          menuDishId: extra.menuDishId,
          name: extra.name,
          description: `Asked for on the quote form: ${portions} portions. Price to follow.`,
          price: 0,
        };
      }
      const price = computeProposalPricing({
        lines: [
          {
            pricingBasis: "per_unit",
            unitPrice: extra.unitPrice,
            quantity: portions,
          },
        ],
        guestCount,
      }).subtotal;
      return {
        menuDishId: extra.menuDishId,
        name: extra.name,
        description: `Asked for on the quote form: ${portions} portions at ${formatMoneyExact(extra.unitPrice)} each.`,
        price,
      };
    });
  return { lines, enhancements };
}

export interface QuoteEstimate {
  /** Always "Estimate": the formal price is the proposal staff publish. */
  label: "Estimate";
  guestCount: number;
  lines: Array<{ description: string; amount: number }>;
  menuSubtotal: number;
  extras: Array<{ description: string; amount: number }>;
  extrasTotal: number;
  total: number;
  /** Picks with no price yet; staff price them in the proposal. */
  priceToFollow: string[];
  assumptions: string[];
}

/**
 * The estimate for these picks, through the same central price calculation
 * as every proposal (computeProposalPricing).
 */
export function buildQuoteEstimate(
  selections: QuoteSelections,
  guestCount: number,
): QuoteEstimate {
  const plan = quoteProposalPlan(selections, guestCount);
  const pricing = computeProposalPricing({ lines: plan.lines, guestCount });
  const menuPricedAsWhole =
    selections.menu != null &&
    (selections.menu.basePrice > 0 || selections.menu.pricePerPerson > 0);
  const priceToFollow = selections.lines
    .filter(
      (line) =>
        line.unitPrice == null && !(line.kind === "menu" && menuPricedAsWhole),
    )
    .map((line) => line.name);
  const extras = plan.enhancements
    .filter((offer) => offer.price > 0)
    .map((offer) => ({ description: offer.name, amount: offer.price }));
  const extrasTotal = computeProposalPricing({
    lines: extras.map((extra) => ({
      pricingBasis: "flat" as const,
      unitPrice: extra.amount,
    })),
    guestCount,
  }).subtotal;
  const total = computeProposalPricing({
    lines: [
      { pricingBasis: "flat", unitPrice: pricing.subtotal },
      { pricingBasis: "flat", unitPrice: extrasTotal },
    ],
    guestCount,
  }).subtotal;

  const assumptions = [
    `Based on ${guestCount} guests.`,
    "Uses today's menu prices. Your proposal confirms the final price.",
    "Tax, service charge, staff and rentals are not included.",
  ];
  if (priceToFollow.length > 0) {
    assumptions.push(`Priced in your proposal: ${priceToFollow.join(", ")}.`);
  }
  return {
    label: "Estimate",
    guestCount,
    lines: pricing.lines.map((line, index) => ({
      description: plan.lines[index].description,
      amount: line.amount,
    })),
    menuSubtotal: pricing.subtotal,
    extras,
    extrasTotal,
    total,
    priceToFollow,
    assumptions,
  };
}

/** Parse stored JSON; null when absent or not the expected shape. */
export function parseQuoteSelections(
  json: string | null | undefined,
): QuoteSelections | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as QuoteSelections;
    return Array.isArray(value?.lines) ? value : null;
  } catch {
    return null;
  }
}

export function parseQuoteEstimate(
  json: string | null | undefined,
): QuoteEstimate | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as QuoteEstimate;
    return value?.label === "Estimate" ? value : null;
  } catch {
    return null;
  }
}

/** The privacy words on the quote form; stored with each request as agreed. */
export const QUOTE_PRIVACY_NOTICE =
  "I consent to the processing of my personal data for the purpose of preparing a quote for my event. I understand my data will be handled according to our privacy notice.";

/** The optional offers-and-news opt-in on the quote form. */
export const QUOTE_MARKETING_NOTICE =
  "Send me occasional offers and news. I can stop these at any time.";
