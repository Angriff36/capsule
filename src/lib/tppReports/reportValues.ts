/**
 * Value readers shared by the TPP report parsers.
 *
 * TPP prints values for people, not for machines: dates carry a weekday, guest
 * counts carry a qualifier, and addresses arrive as one run-on blob. Each
 * reader returns undefined rather than a guess when the text does not fit.
 */

export interface ParsedAddress {
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
}

const MONTH_DAY_YEAR = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const CLOCK_TIME = /(\d{1,2}):(\d{2})\s*([AaPp])\.?[Mm]\.?/;

/** "8/22/2026 - Saturday" → "2026-08-22". Calendar date only, no zone. */
export function parseReportDate(value: string | undefined): string | undefined {
  const match = value?.match(MONTH_DAY_YEAR);
  if (!match) return undefined;
  const [, month, day, year] = match;
  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

/** "5:00 PM" → minutes after midnight. */
export function parseClockMinutes(
  value: string | undefined,
): number | undefined {
  const match = value?.match(CLOCK_TIME);
  if (!match) return undefined;
  const [, rawHour, minute, meridiem] = match;
  let hour = Number(rawHour) % 12;
  if (meridiem!.toLowerCase() === "p") hour += 12;
  return hour * 60 + Number(minute);
}

/**
 * Combine a calendar date and a clock time into epoch milliseconds.
 *
 * TPP exports carry no time zone, so the reports are read in the host zone —
 * the same zone the caterer works in.
 */
export function toEpochMillis(
  isoDate: string,
  minutesAfterMidnight: number,
): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(
    year!,
    month! - 1,
    day!,
    Math.floor(minutesAfterMidnight / 60),
    minutesAfterMidnight % 60,
    0,
    0,
  );
  return date.getTime();
}

/** "$12,911.55" or "($12,646.61)" → 1291155 / -1264661 in minor units. */
export function parseMoneyCents(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const negative = /^\(.*\)$/.test(value.trim());
  const digits = value.replace(/[^0-9.]/g, "");
  if (digits.length === 0) return undefined;
  const amount = Number(digits);
  if (!Number.isFinite(amount)) return undefined;
  const cents = Math.round(amount * 100);
  return negative ? -cents : cents;
}

/** "98 Final" / "98 Final Count" → 98. */
export function parseCount(value: string | undefined): number | undefined {
  const digits = value?.match(/\d+/)?.[0];
  return digits === undefined ? undefined : Number(digits);
}

/** "18.38 Quart" → { quantity: 18.38, unit: "Quart" }. */
export function parseQuantityWithUnit(
  value: string | undefined,
): { quantity: number; unit?: string } | undefined {
  const match = value?.match(/(-?\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return undefined;
  const quantity = Number(match[1]);
  if (!Number.isFinite(quantity)) return undefined;
  const unit = match[2]?.trim();
  return unit ? { quantity, unit } : { quantity };
}

/** "(208)651-1557" / "Home: 9714002003" → digits, kept as printed otherwise. */
export function parsePhone(value: string | undefined): string | undefined {
  const digits = value?.replace(/\D/g, "");
  if (digits === undefined || digits.length < 7) return undefined;
  return digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;

export function parseEmail(value: string | undefined): string | undefined {
  const match = value?.match(EMAIL)?.[0];
  if (match === undefined) return undefined;
  // TPP runs the next label straight onto the address, as in
  // "ben@gmail.comCell: …". Cut after the top-level domain.
  const boundary = match.match(/\.[a-z]{2,}(?=[A-Z]|$)/);
  const trimmed =
    boundary?.index === undefined
      ? match
      : match.slice(0, boundary.index + boundary[0].length);
  return trimmed.replace(/[.,;]$/, "");
}

/**
 * Split "Tim Mitchelltim@mangiacateringco.com" into name and address.
 *
 * TPP concatenates a person's name with their email. The local part of the
 * address is repeated at the end of the name, so removing it recovers both.
 */
export function splitNameAndEmail(value: string | undefined): {
  name?: string;
  email?: string;
} {
  if (value === undefined) return {};
  const email = parseEmail(value);
  if (email === undefined) {
    const name = value.match(/^[A-Za-z'.\- ]+/)?.[0]?.trim();
    return name ? { name } : {};
  }

  const localPart = email.split("@")[0] ?? "";
  const beforeEmail = value.slice(0, value.indexOf(email)).trim();
  const withoutLocalPart = beforeEmail
    .replace(new RegExp(`${escapeRegExp(localPart)}$`, "i"), "")
    .trim();
  const name = (withoutLocalPart || beforeEmail)
    .match(/^[A-Za-z'.\- ]+/)?.[0]
    ?.replace(/[-\s]+$/, "")
    .trim();

  // A name glued straight onto the address cannot be split with confidence,
  // so report neither rather than a wrong pair. Another report supplies it.
  const glued = beforeEmail.length > 0 && withoutLocalPart === beforeEmail;
  if (glued && /[A-Za-z]$/.test(beforeEmail)) return {};

  return name && name.length > 1 ? { name, email } : { email };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a run-on address blob.
 *
 * TPP concatenates address lines with no separator, for example
 * "640 SW Golden Hills DriveB204Pullman, WA 99163". The region and postal code
 * are unambiguous; street and city are separated on the street-type word. When
 * no such word is present the city is left unknown rather than guessed.
 */
export function parseAddressBlob(
  value: string | undefined,
): ParsedAddress | undefined {
  if (value === undefined || value.trim().length === 0) return undefined;

  // Contact details are appended to the same cell; they are not the address.
  const withoutContact = value
    .replace(/(?:Home|Cell|Work|Mobile|Phone|Fax|Main)\s*:[\s\S]*$/i, "")
    .trim();
  const text = splitJoinedWords(withoutContact.replace(/\s+/g, " ").trim());

  const stateAndPostal = [
    ...text.matchAll(/\b([A-Za-z]{2})[,]?\s+(\d{5})(?!\d)/g),
  ].at(-1);
  if (!stateAndPostal) {
    const postal = text.match(/\b(\d{5})(?!\d)/);
    const prefix = postal ? text.slice(0, postal.index).trim() : text;
    const split = splitStreetAndCity(prefix.replace(/,\s*$/, ""));
    return {
      addressLine1: split.street,
      city: split.city,
      postalCode: postal?.[1],
    };
  }

  const prefix = text
    .slice(0, stateAndPostal.index)
    .replace(/,\s*$/, "")
    .trim();
  const split = splitStreetAndCity(prefix);
  return {
    addressLine1: split.street,
    city: split.city,
    region: stateAndPostal[1]!.toUpperCase(),
    postalCode: stateAndPostal[2],
  };
}

const STREET_SUFFIX =
  /\b(Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Blvd|Boulevard|Ln|Lane|Way|Ct|Court|Cir|Circle|Pl|Place|Pkwy|Parkway|Hwy|Highway|Ter|Terrace|Trl|Trail|Loop|Sq|Square)\b\.?/gi;

/**
 * Split "820 E. Sherman Ave Coeur d alene" into street and city.
 *
 * TPP prints no delimiter between the two, so the street-type word is the only
 * reliable boundary. With no such word the whole text stays as the street and
 * the city is left unknown rather than guessed.
 */
function splitStreetAndCity(value: string): {
  street?: string;
  city?: string;
} {
  const text = splitJoinedWords(value);
  STREET_SUFFIX.lastIndex = 0;
  let boundary = -1;
  for (const match of text.matchAll(STREET_SUFFIX)) {
    boundary = match.index + match[0].length;
  }
  if (boundary < 0) return { street: text || undefined };

  let street = text.slice(0, boundary).trim();
  let city = text.slice(boundary).trim();

  // A unit number sits between the street and the city, for example
  // "…Golden Hills Drive B204 Pullman". Keep it with the street.
  const unit = city.match(/^(#?[A-Za-z]?\s?\d+[A-Za-z]?)\s+(.*)$/);
  if (unit) {
    street = `${street} ${unit[1]}`.trim();
    city = unit[2]!.trim();
  }
  return {
    street: street || undefined,
    city: city.length > 0 ? city : undefined,
  };
}

/**
 * Insert a space where TPP joined two lines, for example "DriveB204".
 * Only splits a lower-case letter followed by an upper-case letter or digit.
 */
export function splitJoinedWords(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d{1,4}\b)/g, "$1 $2")
    .replace(/(\d)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Read a person blob such as
 * "Shelby Jarvis640 SW Golden Hills DriveB204Pullman, WA 99163Home: 9714002003".
 * The leading words up to the first digit are the name.
 */
export function parsePersonBlob(value: string | undefined): {
  name?: string;
  email?: string;
  phone?: string;
  address?: ParsedAddress;
} {
  if (value === undefined) return {};
  const email = parseEmail(value);
  const withoutEmail = email ? value.replace(email, " ") : value;
  const phoneLabel = withoutEmail.match(
    /(?:Home|Cell|Work|Mobile|Phone|Fax)\s*:?\s*([\d()\-. ]{7,})/i,
  );
  const phone = parsePhone(phoneLabel?.[1]);

  const beforeDetail = withoutEmail
    .split(/(?:Home|Cell|Work|Mobile|Phone|Fax)\s*:/i)[0]!
    .trim();
  const nameMatch = beforeDetail.match(/^[A-Za-z'.\- ]+/);
  const name = nameMatch?.[0]?.trim();

  const addressText = beforeDetail.slice(name?.length ?? 0).trim();
  return {
    name: name && name.length > 1 ? name : undefined,
    email,
    phone,
    address: addressText.length > 0 ? parseAddressBlob(addressText) : undefined,
  };
}

/** Title case a shouted production-sheet label, for example "CARNE ASADA". */
export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
    .replace(/\bAnd\b/g, "and")
    .replace(/\bFor\b/g, "for")
    .replace(/\bPer\b/g, "per")
    .replace(/\bIn\b/g, "in")
    .replace(/\bOf\b/g, "of");
}
