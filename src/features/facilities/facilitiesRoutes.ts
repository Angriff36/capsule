export const FACILITIES_SECTIONS = [
  { key: "equipment", label: "Equipment", path: "/facilities/equipment" },
  { key: "venues", label: "Venues", path: "/facilities/venues" },
] as const;

export type FacilitiesSection = (typeof FACILITIES_SECTIONS)[number]["key"];

export function venueDetailPath(id: string): string {
  return `/facilities/venues/${id}`;
}

export function venueListPath(): string {
  return "/facilities/venues";
}
