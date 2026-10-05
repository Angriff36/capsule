/**
 * Shared event gallery (Venue Partner Playbook section 06): photos from our
 * events at a venue, shared with the venue for their marketing. A picked
 * photo is a venue file named "Event gallery - <caption> - <file>" that
 * points at the same stored picture; convex/venueGallery.ts reads them back.
 */

export const GALLERY_PREFIX = "Event gallery";

/** "Wedding · June 2026": what the venue sees under a photo. No names. */
export function galleryCaption(
  eventType: string | null | undefined,
  startsAt: number | null | undefined,
): string {
  const month = startsAt
    ? new Date(startsAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "";
  return [eventType?.trim(), month].filter(Boolean).join(" · ") || "Event";
}

export function galleryFileName(caption: string, fileName: string): string {
  return `${GALLERY_PREFIX} - ${caption} - ${fileName}`;
}

export function isGalleryFile(fileName: string): boolean {
  return fileName
    .toLowerCase()
    .startsWith(`${GALLERY_PREFIX.toLowerCase()} - `);
}

/** Food first (the playbook: photos must show the food), then newest event. */
export function sortForGallery<
  T extends { evidenceType?: string | null; eventStartsAt?: number | null },
>(photos: readonly T[]): T[] {
  const rank = (photo: T) => (photo.evidenceType === "food" ? 0 : 1);
  return [...photos].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Number(b.eventStartsAt ?? 0) - Number(a.eventStartsAt ?? 0),
  );
}

/** A link secret no one can guess: 32 random hex characters. */
export function newGalleryToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const venueGalleryPath = (token: string) => `/venue-gallery/${token}`;
