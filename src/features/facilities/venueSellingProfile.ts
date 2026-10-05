/**
 * Venue selling profile (Mangia Venue Partner Playbook section 09): the
 * venue's look picks how the food is presented and served there, from the
 * playbook's Food Presentation Alignment Guide.
 */

export const VENUE_VIBES = [
  "rustic",
  "modern_industrial",
  "garden_outdoor",
  "grand_ballroom",
  "brewery_winery",
  "warehouse_raw",
] as const;

export type VenueVibe = (typeof VENUE_VIBES)[number];

export const VENUE_VIBE_GUIDE: Record<
  VenueVibe,
  { label: string; examples: string; presentation: string; serveStyle: string }
> = {
  rustic: {
    label: "Rustic / farmhouse",
    examples: "Reclaimed wood, exposed beams, country setting",
    presentation:
      "Wood boards, mason jars, burlap and twine, wildflower garnish",
    serveStyle: "Family style, grazing tables, buffet with a rustic display",
  },
  modern_industrial: {
    label: "Modern / industrial",
    examples: "Concrete floors, metal fixtures, skyline views",
    presentation:
      "Clean lines, slate or white plates, simple shapes, one-colour look",
    serveStyle: "Plated, action stations, small plates",
  },
  garden_outdoor: {
    label: "Garden / outdoor",
    examples: "Landscaped grounds, covered patio, vineyard",
    presentation:
      "Fresh herbs, edible flowers, natural wood, garden-to-table look",
    serveStyle:
      "Stations, family style, passed starters during the cocktail hour",
  },
  grand_ballroom: {
    label: "Grand / ballroom",
    examples: "Chandeliers, high ceilings, ornate details",
    presentation:
      "Gold-rimmed plates, crystal displays, tiered platters, white linens",
    serveStyle: "Plated, formal buffet, passed starters on trays",
  },
  brewery_winery: {
    label: "Brewery / winery",
    examples: "Barrels, tasting room, industrial meets rustic",
    presentation:
      "Barrel-stave boards, copper touches, charcuterie first, tasting portions",
    serveStyle: "Stations, small plates, grazing",
  },
  warehouse_raw: {
    label: "Warehouse / open space",
    examples: "Open floor, exposed brick, flexible space",
    presentation:
      "Simple and bold: strong colours, statement displays, dressed-up street food",
    serveStyle: "Food-truck style stations, action stations, hands-on",
  },
};

export function vibeGuide(vibe: string | null | undefined) {
  return vibe && vibe in VENUE_VIBE_GUIDE
    ? VENUE_VIBE_GUIDE[vibe as VenueVibe]
    : null;
}

export type VenueSellingProfile = {
  vibe?: string | null;
  vibeWords?: string | null;
  topFeature?: string | null;
  otherFeatures?: string | null;
  targetClient?: string | null;
  competitivePosition?: string | null;
  photoFocus?: string | null;
  exclusiveItemIdea?: string | null;
};

export function hasSellingProfile(venue: VenueSellingProfile) {
  return [
    venue.vibe,
    venue.vibeWords,
    venue.topFeature,
    venue.otherFeatures,
    venue.targetClient,
    venue.competitivePosition,
    venue.photoFocus,
    venue.exclusiveItemIdea,
  ].some((value) => String(value ?? "").trim() !== "");
}

/**
 * The profile as plain lines, in the playbook's template order. Blank
 * lines are left out; the food look and serve style come from the guide.
 */
export function sellingProfileLines(
  venue: VenueSellingProfile & { name?: string | null },
): Array<{ label: string; text: string }> {
  const guide = vibeGuide(venue.vibe);
  const look = [guide?.label, venue.vibeWords?.trim()]
    .filter(Boolean)
    .join(": ");
  return [
    { label: "Look", text: look },
    { label: "What makes it special", text: venue.topFeature ?? "" },
    { label: "Also worth showing", text: venue.otherFeatures ?? "" },
    { label: "Who books it", text: venue.targetClient ?? "" },
    { label: "Food look", text: guide?.presentation ?? "" },
    { label: "Best serve style", text: guide?.serveStyle ?? "" },
    { label: "Only-here dish idea", text: venue.exclusiveItemIdea ?? "" },
    { label: "Against other venues", text: venue.competitivePosition ?? "" },
    { label: "Photo focus", text: venue.photoFocus ?? "" },
  ]
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => line.text !== "");
}
