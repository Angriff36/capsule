/**
 * Read-side aggregation for the Guests tab. Pure — the panel owns the
 * queries and commands, this file only counts what the guest list already
 * says. Nothing here invents a guest, a dietary need, or an allergen: a
 * label appears only because a recorded guest carries it.
 */

export type GuestSummaryRow = {
  rsvpStatus: string;
  checkedInAt?: number | null;
  specialMealRequired?: boolean;
  dietaryRestrictions?: string[] | null;
  allergenRestrictions?: string[] | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  tableAssignment?: string | null;
};

export type GuestTally = { label: string; count: number };

export type GuestSummary = {
  total: number;
  confirmed: number;
  pending: number;
  declined: number;
  checkedIn: number;
  specialMeals: number;
  unassignedTables: number;
  /** Whole-percent acceptance of the invited list; 0 when nobody is invited. */
  acceptanceRate: number;
  dietary: GuestTally[];
  allergens: GuestTally[];
};

/** Guests carrying no recorded dietary need. Not a claim that they have none. */
export const NO_DIETARY_LABEL = "None recorded";

function tally(values: string[]): GuestTally[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const label = raw.trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function summarizeEventGuests(guests: GuestSummaryRow[]): GuestSummary {
  const total = guests.length;
  const confirmed = guests.filter(
    (guest) => guest.rsvpStatus === "confirmed",
  ).length;
  const dietaryValues: string[] = [];
  const allergenValues: string[] = [];
  for (const guest of guests) {
    const diets = (guest.dietaryRestrictions ?? []).filter(Boolean);
    dietaryValues.push(...(diets.length ? diets : [NO_DIETARY_LABEL]));
    allergenValues.push(...(guest.allergenRestrictions ?? []).filter(Boolean));
  }
  return {
    total,
    confirmed,
    pending: guests.filter((guest) => guest.rsvpStatus === "pending").length,
    declined: guests.filter((guest) => guest.rsvpStatus === "declined").length,
    checkedIn: guests.filter((guest) => guest.checkedInAt != null).length,
    specialMeals: guests.filter((guest) => guest.specialMealRequired === true)
      .length,
    unassignedTables: guests.filter(
      (guest) => !String(guest.tableAssignment ?? "").trim(),
    ).length,
    acceptanceRate: total > 0 ? Math.round((confirmed / total) * 100) : 0,
    dietary: tally(dietaryValues),
    allergens: tally(allergenValues),
  };
}

export const GUEST_FILTERS = [
  { key: "all", label: "All guests" },
  { key: "confirmed", label: "Confirmed" },
  { key: "pending", label: "Pending" },
  { key: "declined", label: "Declined" },
  { key: "special", label: "Special meals" },
] as const;

export type GuestFilterKey = (typeof GUEST_FILTERS)[number]["key"];

/** Client-side view filter. It hides rows; it never blocks a command. */
export function matchesGuestFilter(
  guest: GuestSummaryRow,
  filter: GuestFilterKey,
  search: string,
): boolean {
  if (filter === "special" && guest.specialMealRequired !== true) return false;
  if (filter !== "all" && filter !== "special" && guest.rsvpStatus !== filter)
    return false;
  const needle = search.trim().toLowerCase();
  if (!needle) return true;
  return [
    guest.name,
    guest.email ?? "",
    guest.phone ?? "",
    guest.tableAssignment ?? "",
    ...(guest.dietaryRestrictions ?? []),
    ...(guest.allergenRestrictions ?? []),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}
