// Venue operating facts (PL-VENUE-PROFILE, spec §8.1): seated / standing
// capacity, oven, fridge and the load-in window. Pure helpers shared by the
// venue page, the venue list filter and the event-day sheet.

export type VenueOperatingFacts = {
  readonly capacity?: number | null;
  readonly seatedCapacity?: number | null;
  readonly standingCapacity?: number | null;
  readonly hasOven?: boolean | null;
  readonly hasRefrigeration?: boolean | null;
  readonly loadInFrom?: string | null;
  readonly loadOutBy?: string | null;
};

export type OperatingFactsArgs = {
  seatedCapacity?: number;
  standingCapacity?: number;
  hasOven?: boolean;
  hasRefrigeration?: boolean;
  loadInFrom?: string;
  loadOutBy?: string;
};

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

function count(raw: string, label: string): number | undefined | string {
  const text = raw.trim();
  if (text === "") return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) {
    return `${label} must be a whole number, zero or more.`;
  }
  return value;
}

function yesNo(raw: string): boolean | undefined {
  return raw === "true" ? true : raw === "false" ? false : undefined;
}

/** Form values -> command args, or the first plain-words problem. */
export function operatingFactsFromForm(form: {
  seatedCapacity: string;
  standingCapacity: string;
  hasOven: string;
  hasRefrigeration: string;
  loadInFrom: string;
  loadOutBy: string;
}): { ok: true; value: OperatingFactsArgs } | { ok: false; error: string } {
  const seated = count(form.seatedCapacity, "Seated guests");
  if (typeof seated === "string") return { ok: false, error: seated };
  const standing = count(form.standingCapacity, "Standing guests");
  if (typeof standing === "string") return { ok: false, error: standing };
  const loadInFrom = form.loadInFrom.trim();
  const loadOutBy = form.loadOutBy.trim();
  for (const [value, label] of [
    [loadInFrom, "Load-in from"],
    [loadOutBy, "Load-out by"],
  ] as const) {
    if (value !== "" && !CLOCK.test(value)) {
      return { ok: false, error: `${label} needs a time like 07:30.` };
    }
  }
  return {
    ok: true,
    value: {
      seatedCapacity: seated,
      standingCapacity: standing,
      hasOven: yesNo(form.hasOven),
      hasRefrigeration: yesNo(form.hasRefrigeration),
      loadInFrom: loadInFrom || undefined,
      loadOutBy: loadOutBy || undefined,
    },
  };
}

/** "07:30" -> "7:30am". */
export function clockLabel(value: string): string {
  const match = CLOCK.exec(value);
  if (!match) return value;
  const [hours, minutes] = value.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/** Load-in window in plain words, or null when neither end is on file. */
export function loadWindowLabel(facts: VenueOperatingFacts): string | null {
  const from = facts.loadInFrom ? clockLabel(facts.loadInFrom) : null;
  const by = facts.loadOutBy ? clockLabel(facts.loadOutBy) : null;
  if (from && by) return `Load in from ${from}, out by ${by}`;
  if (from) return `Load in from ${from}`;
  if (by) return `Out by ${by}`;
  return null;
}

/** Guests the venue holds for the event's style: seated for a seated meal,
 * standing for a reception, else the overall capacity. null = not known. */
export function guestCapacityFor(
  facts: VenueOperatingFacts,
  serviceStyleName: string | null | undefined,
): number | null {
  const style = (serviceStyleName ?? "").toLowerCase();
  const standing = /reception|cocktail|station|passed|stand/.test(style);
  const seated = /plated|seated|family|dinner/.test(style);
  const pick =
    (standing ? facts.standingCapacity : null) ??
    (seated ? facts.seatedCapacity : null) ??
    (facts.capacity && facts.capacity > 0 ? facts.capacity : null) ??
    Math.max(facts.seatedCapacity ?? 0, facts.standingCapacity ?? 0);
  return pick && pick > 0 ? pick : null;
}

export type VenueFilter = {
  readonly minGuests: number | null;
  readonly premise: "any" | "on" | "off";
  readonly needsOven: boolean;
  readonly needsFridge: boolean;
  readonly needsParking: boolean;
};

export const NO_VENUE_FILTER: VenueFilter = {
  minGuests: null,
  premise: "any",
  needsOven: false,
  needsFridge: false,
  needsParking: false,
};

/** Venue list filter on the structured facts. A fact that is not on file
 * does not pass a "must have" box: the list shows venues known to fit. */
export function venueMatchesFilter(
  venue: VenueOperatingFacts & {
    readonly onPremise?: boolean | null;
    readonly parkingAvailable?: boolean | null;
  },
  filter: VenueFilter,
): boolean {
  if (
    filter.minGuests != null &&
    largestKnownCapacity(venue) < filter.minGuests
  )
    return false;
  if (filter.premise === "on" && venue.onPremise !== true) return false;
  if (filter.premise === "off" && venue.onPremise !== false) return false;
  if (filter.needsOven && venue.hasOven !== true) return false;
  if (filter.needsFridge && venue.hasRefrigeration !== true) return false;
  if (filter.needsParking && venue.parkingAvailable !== true) return false;
  return true;
}

/** Largest guest count the venue is known to hold (venue list filter). */
export function largestKnownCapacity(facts: VenueOperatingFacts): number {
  return Math.max(
    facts.capacity ?? 0,
    facts.seatedCapacity ?? 0,
    facts.standingCapacity ?? 0,
  );
}
