/**
 * GPS coordinates for venues with no street address (#368 item 9 — a family
 * campsite whose only location descriptor was "47.01359° N, 116.52979° W",
 * which had to be jammed into the Address field). Accepts what people paste:
 * plain decimals ("47.01359, -116.52979"), degree symbols, and N/S/E/W
 * hemisphere letters. Stored as signed decimal degrees.
 */
export type VenueCoordinates = { latitude: number; longitude: number };

const HEMISPHERE_SIGN: Record<string, 1 | -1> = {
  N: 1,
  S: -1,
  E: 1,
  W: -1,
};

function parseSignedDegrees(raw: string): number | null {
  const trimmed = raw.trim().replace(/[°º]/g, "").trim();
  if (!trimmed) return null;
  const match =
    /^([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$|^([NSEW])\s*([+-]?\d+(?:\.\d+)?)$/i.exec(
      trimmed,
    );
  if (!match) return null;
  const value = Number(match[1] ?? match[4]);
  if (!Number.isFinite(value)) return null;
  const letter = (match[2] ?? match[3] ?? "").toUpperCase();
  if (!letter) return value;
  return Math.abs(value) * (HEMISPHERE_SIGN[letter] ?? 1);
}

/** One pasted "lat, long" string → coordinates, or null when it isn't one. */
export function parseCoordinatePair(text: string): VenueCoordinates | null {
  const parts = text.split(/[,;]|\s{2,}/).filter((part) => part.trim());
  if (parts.length !== 2) return null;
  const latitude = parseSignedDegrees(parts[0] ?? "");
  const longitude = parseSignedDegrees(parts[1] ?? "");
  if (latitude == null || longitude == null) return null;
  return validCoordinates({ latitude, longitude })
    ? { latitude, longitude }
    : null;
}

/** Separate latitude / longitude inputs → coordinates. Both blank → undefined. */
export function coordinatesFromFields(
  latitudeText: string,
  longitudeText: string,
):
  | { ok: true; value: VenueCoordinates | undefined }
  | { ok: false; error: string } {
  const latBlank = !latitudeText.trim();
  const lonBlank = !longitudeText.trim();
  if (latBlank && lonBlank) return { ok: true, value: undefined };
  if (latBlank !== lonBlank) {
    return {
      ok: false,
      error: "Enter both latitude and longitude, or neither.",
    };
  }
  const latitude = parseSignedDegrees(latitudeText);
  const longitude = parseSignedDegrees(longitudeText);
  if (latitude == null || longitude == null) {
    return {
      ok: false,
      error:
        "Enter each coordinate as a plain number, like 47.01359 and -116.52979.",
    };
  }
  if (!validCoordinates({ latitude, longitude })) {
    return {
      ok: false,
      error:
        "Latitude has to be between -90 and 90, and longitude between -180 and 180.",
    };
  }
  return { ok: true, value: { latitude, longitude } };
}

export function validCoordinates(value: VenueCoordinates): boolean {
  return Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

/** "47.01359° N, 116.52979° W" — how the coordinates read on a pack list. */
export function formatCoordinates(value: VenueCoordinates): string {
  const lat = `${Math.abs(value.latitude).toFixed(5)}° ${value.latitude < 0 ? "S" : "N"}`;
  const lon = `${Math.abs(value.longitude).toFixed(5)}° ${value.longitude < 0 ? "W" : "E"}`;
  return `${lat}, ${lon}`;
}

/** A maps link the driver can tap from the venue record. */
export function coordinatesMapUrl(value: VenueCoordinates): string {
  return `https://www.google.com/maps?q=${value.latitude},${value.longitude}`;
}

/** Read the optional pair off a stored venue row. */
export function venueCoordinates(venue: {
  latitude?: number | null;
  longitude?: number | null;
}): VenueCoordinates | null {
  if (venue.latitude == null || venue.longitude == null) return null;
  return { latitude: venue.latitude, longitude: venue.longitude };
}
