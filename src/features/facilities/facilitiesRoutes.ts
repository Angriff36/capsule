export const FACILITIES_SECTIONS = [
  { key: "venues", label: "Venues", path: "/facilities/venues" },
  { key: "equipment", label: "Equipment", path: "/facilities/equipment" },
  {
    key: "layout-templates",
    label: "Layout templates",
    path: "/facilities/venues/templates",
  },
  {
    key: "vendor-relationships",
    label: "Vendor relationships",
    path: "/facilities/vendor-relationships",
  },
] as const;

export type FacilitiesSection = (typeof FACILITIES_SECTIONS)[number]["key"];

export function venueDetailPath(id: string): string {
  return `/facilities/venues/${id}`;
}

export function venueMenuCardPath(id: string): string {
  return `/facilities/venues/${id}/menu-card`;
}

export function venueInfoPacketPath(id: string): string {
  return `/facilities/venues/${id}/info-packet`;
}

export function venueListPath(): string {
  return "/facilities/venues";
}

export function venueLayoutTemplatesListPath(venueId?: string): string {
  return venueId
    ? `/facilities/venues/templates?venue=${venueId}`
    : `/facilities/venues/templates`;
}

export function venueLayoutTemplateDetailPath(id: string): string {
  return `/facilities/venues/templates/${id}`;
}

export function venueVendorRelationshipsListPath(venueId?: string): string {
  return venueId
    ? `/facilities/vendor-relationships?venue=${venueId}`
    : `/facilities/vendor-relationships`;
}

export function venueVendorRelationshipDetailPath(id: string): string {
  return `/facilities/vendor-relationships/${id}`;
}
