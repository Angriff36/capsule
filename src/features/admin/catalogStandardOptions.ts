import { SERVICE_STYLE_CATALOG } from "../events/serviceStyleCatalog";

/**
 * The standard catering lists behind Admin → Catalogs. Values come from the
 * TPP master export (work/tpp-raw-master-2021-2026.csv value tallies). A fresh
 * tenant starts with every catalog empty (#368 item 5); the "Add the standard
 * list" button on each catalog registers the rows below that the tenant does
 * not already have, so a Wedding / Salesperson / Repeat Customer pick is one
 * click away instead of a hand-typed admin chore. `scripts/seed-catalogs.ts`
 * reads the same lists so the script and the button never disagree.
 */
export type StandardCatalogRow = {
  name: string;
  code: string;
  description?: string;
};

export const OCCASION_CATALOG: readonly StandardCatalogRow[] = [
  { name: "Corporate Event", code: "corporate-event" },
  { name: "Wedding", code: "wedding" },
  { name: "Social Event", code: "social-event" },
  { name: "Vending", code: "vending" },
  { name: "Christmas Party", code: "christmas-party" },
  { name: "Birthday Party", code: "birthday-party" },
  { name: "Holiday", code: "holiday" },
  { name: "Rehearsal Dinner", code: "rehearsal-dinner" },
  { name: "Marketing Event", code: "marketing-event" },
  { name: "Fundraiser / Gala", code: "fundraiser-gala" },
  { name: "Funeral / Memorial / Celebration of Life", code: "memorial" },
  { name: "Aviation", code: "aviation" },
  { name: "Retreat", code: "retreat" },
  { name: "Graduation Party", code: "graduation-party" },
  { name: "Grand Opening", code: "grand-opening" },
  { name: "Private Chef", code: "private-chef" },
  { name: "Anniversary", code: "anniversary" },
  { name: "Open House", code: "open-house" },
  { name: "Bridal Shower", code: "bridal-shower" },
  { name: "Baby Shower", code: "baby-shower" },
  { name: "Retirement", code: "retirement" },
  { name: "Client Tasting", code: "client-tasting" },
  { name: "Other", code: "other" },
];

export const REFERRAL_SOURCE_CATALOG: readonly StandardCatalogRow[] = [
  { name: "EZ Cater", code: "ez-cater" },
  { name: "Repeat Customer", code: "repeat-customer" },
  { name: "Referral", code: "referral" },
  { name: "Google", code: "google" },
  { name: "Salesperson", code: "salesperson" },
  { name: "Greater Spokane Food Truck Association", code: "gsfta" },
  { name: "Venue", code: "venue" },
  { name: "Event Planner", code: "event-planner" },
  { name: "The Knot", code: "the-knot" },
  { name: "Mangia Web", code: "mangia-web" },
  { name: "Spokane Eats", code: "spokane-eats" },
  { name: "Stancraft", code: "stancraft" },
  { name: "Wedding Planner", code: "wedding-planner" },
  { name: "Itex", code: "itex" },
  { name: "Wedding Wire", code: "wedding-wire" },
  { name: "Another Caterer", code: "another-caterer" },
  { name: "Instagram", code: "instagram" },
  { name: "Facebook", code: "facebook" },
  { name: "CDA Press", code: "cda-press" },
  { name: "Air Culinaire", code: "air-culinaire" },
  { name: "Templins", code: "templins" },
  { name: "Bridal Fair", code: "bridal-fair" },
  { name: "Other", code: "other" },
];

export { SERVICE_STYLE_CATALOG };

/** The standard rows this tenant does not have yet, matched by code. */
export function missingStandardRows(
  standard: readonly StandardCatalogRow[],
  existing: ReadonlyArray<{ code: string }> | undefined,
): StandardCatalogRow[] {
  const have = new Set((existing ?? []).map((row) => row.code));
  return standard.filter((row) => !have.has(row.code));
}
