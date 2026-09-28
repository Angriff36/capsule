import { formatMoneyExact } from "../../lib/format";
import type { MenuPriceLabel } from "../../lib/catalogEligibility";

// Client-facing words for catalog prices, shared by the public menu and the
// quote form so both read the same.

export function menuPriceText(price: MenuPriceLabel): string {
  if (price.kind === "per_person") {
    return `${formatMoneyExact(price.perPerson)} per person`;
  }
  if (price.kind === "starting_at") {
    return price.perPerson > 0
      ? `Starting at ${formatMoneyExact(price.from)} plus ${formatMoneyExact(price.perPerson)} per person`
      : `Starting at ${formatMoneyExact(price.from)}`;
  }
  return "Priced with your quote";
}

export function dishPriceText(price: number | null): string {
  return price == null ? "Priced with your quote" : formatMoneyExact(price);
}

export function guestRangeText(minGuests: number, maxGuests: number): string {
  if (minGuests > 0 && maxGuests > 0) return `${minGuests}–${maxGuests} guests`;
  if (minGuests > 0) return `At least ${minGuests} guests`;
  if (maxGuests > 0) return `Up to ${maxGuests} guests`;
  return "Any number of guests";
}

export function seasonText(
  availableFrom: number | null,
  availableUntil: number | null,
): string | null {
  const day = (ms: number) =>
    new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (availableFrom != null && availableUntil != null) {
    return `Offered ${day(availableFrom)} – ${day(availableUntil)}`;
  }
  if (availableFrom != null) return `Offered from ${day(availableFrom)}`;
  if (availableUntil != null) return `Offered until ${day(availableUntil)}`;
  return null;
}

// Allergen codes are stored lowercase ("tree_nuts"); show them as words.
export function allergenText(code: string): string {
  const words = code.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
