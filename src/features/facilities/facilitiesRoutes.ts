export const FACILITIES_SECTIONS = [
  { key: "equipment", label: "Equipment", path: "/facilities/equipment" },
  { key: "venues", label: "Venues", path: "/facilities/venues" },
  {
    key: "layout-templates",
    label: "Layout Templates",
    path: "/facilities/venues/templates",
  },
  {
    key: "vendor-relationships",
    label: "Vendor Relationships",
    path: "/facilities/vendor-relationships",
  },
] as const;

export type FacilitiesSection = (typeof FACILITIES_SECTIONS)[number]["key"];

export function venueDetailPath(id: string): string {
  return `/facilities/venues/${id}`;
}

export function venueListPath(): string {
  return "/facilities/venues";
}

export function venueLayoutTemplatesListPath(venueId?: string): string {
  return venueId
    ? `/facilities/venues/${venueId}/templates`
    : `/facilities/venues/templates`;
}

export function venueLayoutTemplateDetailPath(id: string): string {
  return `/facilities/venues/templates/${id}`;
}

export function venueVendorRelationshipsListPath(venueId?: string): string {
  return venueId
    ? `/facilities/venues/${venueId}/vendor-relationships`
    : `/facilities/vendor-relationships`;
}

export function venueVendorRelationshipDetailPath(id: string): string {
  return `/facilities/vendor-relationships/${id}`;
}
