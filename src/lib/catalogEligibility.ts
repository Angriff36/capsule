// One set of catalog rules for every price reader (spec CF-4-2): the public
// menu, the quote form, proposal pricing and the revision snapshot all ask
// these functions which price is in force and whether a menu fits an event.
// Pure — no database access — so Convex seams and the browser share it.

type Money = number | null | undefined;

export interface PricedCatalogLine {
  sellingPrice?: Money;
  scheduledSellingPrice?: Money;
  scheduledPriceEffectiveAt?: number | null;
}

const toNumber = (value: Money): number | null =>
  value == null ? null : Number(value);

/**
 * The sell price in force at `at`: a dated price change applies from its
 * day on; before it, the current price. Null when the dish has no price.
 */
export function effectiveSellingPrice(
  line: PricedCatalogLine,
  at: number,
): number | null {
  if (
    line.scheduledPriceEffectiveAt != null &&
    line.scheduledPriceEffectiveAt <= at &&
    line.scheduledSellingPrice != null
  ) {
    return toNumber(line.scheduledSellingPrice);
  }
  return toNumber(line.sellingPrice);
}

export interface CatalogMenuTerms {
  basePrice?: Money;
  pricePerPerson?: Money;
  minGuests?: number | null;
  maxGuests?: number | null;
  availableFrom?: number | null;
  availableUntil?: number | null;
}

/** True when the event date falls inside the menu's season (no season = all year). */
export function menuInSeason(
  menu: CatalogMenuTerms,
  eventDate: number,
): boolean {
  if (menu.availableFrom != null && eventDate < menu.availableFrom)
    return false;
  if (menu.availableUntil != null && eventDate > menu.availableUntil)
    return false;
  return true;
}

/** True when the guest count meets the minimum and stays within the maximum (0 = no limit). */
export function menuFitsGuests(
  menu: CatalogMenuTerms,
  guestCount: number,
): boolean {
  const min = menu.minGuests ?? 0;
  const max = menu.maxGuests ?? 0;
  return guestCount >= min && (max === 0 || guestCount <= max);
}

/** Plain reasons a menu cannot be booked for this event; empty when it can. */
export function menuIneligibleReasons(
  menu: CatalogMenuTerms,
  event: { eventDate?: number | null; guestCount?: number | null },
): string[] {
  const reasons: string[] = [];
  if (event.eventDate != null && !menuInSeason(menu, event.eventDate)) {
    reasons.push("Not offered on this date");
  }
  if (event.guestCount != null && !menuFitsGuests(menu, event.guestCount)) {
    const min = menu.minGuests ?? 0;
    const max = menu.maxGuests ?? 0;
    reasons.push(
      event.guestCount < min
        ? `Needs at least ${min} guests`
        : `Serves up to ${max} guests`,
    );
  }
  return reasons;
}

export type MenuPriceLabel =
  | { kind: "per_person"; perPerson: number }
  | { kind: "starting_at"; from: number; perPerson: number }
  | { kind: "on_request" };

/**
 * How a menu's price reads to a client. A per-person price alone is fixed;
 * a base fee means the total depends on the event, so it reads "starting at"
 * the base fee (plus the per-person price when there is one).
 */
export function menuPriceLabel(menu: CatalogMenuTerms): MenuPriceLabel {
  const base = toNumber(menu.basePrice) ?? 0;
  const perPerson = toNumber(menu.pricePerPerson) ?? 0;
  if (base > 0) return { kind: "starting_at", from: base, perPerson };
  if (perPerson > 0) return { kind: "per_person", perPerson };
  return { kind: "on_request" };
}
