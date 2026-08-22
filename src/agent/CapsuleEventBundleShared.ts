import type { EventBundle } from "../lib/tppReports/eventBundle";

/**
 * Pieces the event-bundle planners share: the step shape, name keys, money
 * and the prose builders. Kept apart so the planners stay small and pure.
 */

/** A step whose result later steps refer to, by this local reference name. */
export interface PlannedStep {
  capabilityId: string;
  /** Local name for the created record, for example "event" or "dish:3". */
  ref: string;
  /** Short human description for the preview. */
  label: string;
  args: Record<string, unknown>;
  /**
   * Argument names whose value must be replaced with the docId of an earlier
   * step (or a seeded id) before the call. The value in `args` is that ref.
   */
  resolveRefs?: string[];
  idempotencySuffix: string;
}

export function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Menu items match across reports and Capsule without their parenthetical
 * notes: "Flour Tortillas For Tacos (3 per person)" is "Flour Tortillas For
 * Tacos" on the event.
 */
export function dishKey(value: string): string {
  return normalizeName(value.replace(/\([^)]*\)/g, ""));
}

/**
 * A timeline entry already exists when the stored name and the report's name
 * share a base. The kitchen appends owners ("Set buffet - Allison + Kiara");
 * the battle board PDF appends categories and notes ("Fill chafers BUFFET").
 */
export function timelineEntryExists(
  name: string,
  existingNames: readonly string[],
): boolean {
  const key = normalizeName(name);
  if (key.length < 4) return false;
  return existingNames.some((existing) => {
    const stored = normalizeName(existing);
    const base = normalizeName(existing.split(/\s[-–—]\s/)[0] ?? existing);
    return (
      stored === key ||
      stored.startsWith(key) ||
      (base.length >= 6 && key.startsWith(base)) ||
      commonPrefixLength(stored, key) >= 14
    );
  });
}

function commonPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

/**
 * Report rows that sit in the menu tables but are not food: rental lines,
 * staffing slots, set-up notes and the priced menu-package header. They may
 * still be priced (so they reach the proposal) but never become dishes.
 */
export function isMenuDishLine(item: {
  name: string;
  course?: string;
}): boolean {
  if (/unassigned|^set ?up\b|menu experience|^event rents$/i.test(item.name)) {
    return false;
  }
  if (
    item.course &&
    /rental|equipment|staff|captain|\bfoh\b|\bboh\b|labor|labour/i.test(
      item.course,
    )
  ) {
    return false;
  }
  return true;
}

export function centsToDollars(cents: number | undefined): number {
  return cents === undefined ? 0 : Math.round(cents) / 100;
}

export function personNameParts(name: string | undefined): {
  givenName?: string;
  familyName?: string;
} {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { givenName: parts[0] };
  return {
    givenName: parts.slice(0, -1).join(" "),
    familyName: parts.at(-1),
  };
}

export function venueAddressText(bundle: EventBundle): string | undefined {
  const venue = bundle.venue;
  const parts = [
    venue.addressLine1,
    venue.city,
    venue.region,
    venue.postalCode,
  ].filter((part): part is string => part !== undefined && part.length > 0);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

/** Operational prose the reports carry, joined for the event record. */
export function operationalRequirementsText(
  bundle: EventBundle,
): string | undefined {
  const notes = bundle.notes;
  const parts = [
    notes.operationsNotes && `Operations: ${notes.operationsNotes}`,
    notes.serviceSetup && `Service setup: ${notes.serviceSetup}`,
    notes.cateringKitchen && `Kitchen: ${notes.cateringKitchen}`,
    notes.equipmentRentals && `Rentals: ${notes.equipmentRentals}`,
    notes.decor && `Decor: ${notes.decor}`,
    notes.menuNotes && `Menu notes: ${notes.menuNotes}`,
    notes.additionalTasks && `Also: ${notes.additionalTasks}`,
  ].filter((part): part is string => typeof part === "string");
  return parts.length > 0 ? parts.join("\n") : undefined;
}

/**
 * Quantities the kitchen and purchasing commands accept start at 1. TPP
 * prints fractions ("0.03 Gallon"). Round up and keep the printed amount.
 */
export function wholeQuantity(value: number | undefined): {
  quantity: number;
  rounded: boolean;
} {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return { quantity: 1, rounded: value !== undefined };
  }
  if (value < 1) return { quantity: 1, rounded: true };
  return { quantity: value, rounded: false };
}
