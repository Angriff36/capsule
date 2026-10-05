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

// The menu book's short diet marks (V, VG, GF, DF, NF) with their key words.
// Dish diet tags are typed by hand, so "Gluten free", "gluten-free" and "GF"
// all read as GF. A tag outside this list stays a word on the dish.
export const DIET_MARKS = [
  { mark: "V", label: "Vegetarian", names: ["v", "vegetarian", "veg"] },
  { mark: "VG", label: "Vegan", names: ["vg", "vegan"] },
  { mark: "GF", label: "Gluten free", names: ["gf", "glutenfree"] },
  { mark: "DF", label: "Dairy free", names: ["df", "dairyfree"] },
  { mark: "NF", label: "Nut free", names: ["nf", "nutfree"] },
] as const;

export type DietMark = (typeof DIET_MARKS)[number];

export function dietMark(tag: string): DietMark | null {
  const key = tag.toLowerCase().replace(/[^a-z]/g, "");
  return DIET_MARKS.find((entry) => entry.names.some((n) => n === key)) ?? null;
}

/**
 * Dishes under their course headings, in menu order: a course starts where
 * its first dish sits. Dishes with no course come first, with no heading.
 */
export function courseGroups<T extends { course: string | null }>(
  dishes: T[],
): { course: string | null; dishes: T[] }[] {
  const groups: { course: string | null; dishes: T[] }[] = [];
  for (const dish of dishes) {
    const course = dish.course?.trim() || null;
    const group = groups.find(
      (g) => g.course?.toLowerCase() === course?.toLowerCase(),
    );
    if (group) group.dishes.push(dish);
    else if (course === null) groups.unshift({ course, dishes: [dish] });
    else groups.push({ course, dishes: [dish] });
  }
  return groups;
}

// Allergen codes are stored lowercase ("tree_nuts"); show them as words.
export function allergenText(code: string): string {
  const words = code.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
