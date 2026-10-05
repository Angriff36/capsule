import { vibeGuide } from "./venueSellingProfile";
import { shotOf } from "./venueSiteVisit";

/**
 * Venue info packet (Venue Partner Playbook sections 06 and 10): the PDF a
 * client gets when we recommend this venue. Client-facing only: no partner
 * grades, no competitor notes, no back-of-house photos.
 */

/** Site visit shots that are for our crew, never for a client. */
export const CREW_ONLY_SHOTS = new Set([
  "Load-in path",
  "Kitchen",
  "Restrooms",
  "Damage",
]);

export type PacketFile = {
  _id: string;
  fileName: string;
  contentType?: string | null;
  url?: string | null;
};

/** Pictures of the venue a client may see, newest upload order kept. */
export function packetPhotos<T extends PacketFile>(files: readonly T[]): T[] {
  return files.filter((file) => {
    if (!file.url || !String(file.contentType ?? "").startsWith("image/"))
      return false;
    const shot = shotOf(file.fileName);
    return !shot || !CREW_ONLY_SHOTS.has(shot);
  });
}

export type PacketVenue = {
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  capacity?: number | null;
  seatedCapacity?: number | null;
  standingCapacity?: number | null;
  vibe?: string | null;
  vibeWords?: string | null;
  topFeature?: string | null;
  otherFeatures?: string | null;
  targetClient?: string | null;
};

const clean = (value: string | null | undefined) => value?.trim() || "";

/** The facts block of the packet, blanks left out. */
export function packetFacts(venue: PacketVenue) {
  const facts: { label: string; text: string }[] = [];
  const street = [venue.addressLine1, venue.addressLine2]
    .map(clean)
    .filter(Boolean)
    .join(", ");
  const town = [clean(venue.city), clean(venue.region)]
    .filter(Boolean)
    .join(", ");
  const address = [
    street,
    [town, clean(venue.postalCode)].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  if (address) facts.push({ label: "Where", text: address });

  const guests = [
    venue.seatedCapacity ? `${venue.seatedCapacity} seated` : "",
    venue.standingCapacity ? `${venue.standingCapacity} standing` : "",
  ].filter(Boolean);
  if (guests.length === 0 && venue.capacity) {
    guests.push(`Up to ${venue.capacity} guests`);
  }
  if (guests.length) facts.push({ label: "Guests", text: guests.join(" · ") });

  const guide = vibeGuide(venue.vibe);
  const look = [guide?.label, clean(venue.vibeWords)]
    .filter(Boolean)
    .join(" — ");
  if (look) facts.push({ label: "The look", text: look });
  if (clean(venue.topFeature))
    facts.push({
      label: "What guests remember",
      text: clean(venue.topFeature),
    });
  if (clean(venue.otherFeatures))
    facts.push({ label: "Also here", text: clean(venue.otherFeatures) });
  if (clean(venue.targetClient))
    facts.push({ label: "A great fit for", text: clean(venue.targetClient) });
  if (guide) {
    facts.push({ label: "How we serve here", text: guide.serveStyle });
    facts.push({ label: "How the food looks here", text: guide.presentation });
  }
  return facts;
}
