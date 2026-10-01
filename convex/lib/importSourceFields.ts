// PL-SOURCE-DELTA (AC-272, AC-273): which fields a repeat import compares for
// each dataset, read from the parsed source row and from the Capsule record.
// The three-way rule itself lives in culinaryModel/importMapping.ts
// (threeWayReconcile); this file only names the fields and how to read them.
import type { FieldValue } from "./culinaryModel/importMapping";

export type SourceDeltaDataset = "contacts" | "venues";

type Values = Record<string, FieldValue>;
type Row = Record<string, unknown>;

const text = (value: unknown): FieldValue =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
const num = (value: unknown): FieldValue =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export interface SourceFieldMap {
  /** Every field the repeat import compares. */
  fields: readonly string[];
  /** Fields the import may write back into Capsule. Others only raise a review item. */
  writable: readonly string[];
  /** Plain words for the review list. */
  labels: Record<string, string>;
  fromSource(row: Row): Values;
  fromCapsule(doc: Row): Values;
}

const CONTACT_FIELDS: SourceFieldMap = {
  fields: ["givenName", "familyName", "email", "phone"],
  writable: ["email", "phone"],
  labels: {
    givenName: "First name",
    familyName: "Last name",
    email: "Email",
    phone: "Phone",
  },
  fromSource: (row) => ({
    givenName: text(row.givenName),
    familyName: text(row.familyName),
    email: text(row.email),
    phone: text(row.phone) ?? text(row.mobile),
  }),
  fromCapsule: (doc) => ({
    givenName: text(doc.givenName),
    familyName: text(doc.familyName),
    email: text(doc.email),
    phone: text(doc.phone),
  }),
};

const VENUE_TEXT = [
  "name",
  "addressLine1",
  "city",
  "region",
  "postalCode",
  "contactName",
  "contactPhone",
  "contactEmail",
  "accessNotes",
  "cateringNotes",
] as const;

const VENUE_FIELDS: SourceFieldMap = {
  fields: [...VENUE_TEXT, "capacity"],
  writable: [...VENUE_TEXT, "capacity"],
  labels: {
    name: "Venue name",
    addressLine1: "Street address",
    city: "City",
    region: "State",
    postalCode: "ZIP code",
    contactName: "Venue contact",
    contactPhone: "Venue contact phone",
    contactEmail: "Venue contact email",
    accessNotes: "Access notes",
    cateringNotes: "Catering notes",
    capacity: "Capacity",
  },
  fromSource: (row) => ({
    ...Object.fromEntries(VENUE_TEXT.map((f) => [f, text(row[f])])),
    capacity: num(row.capacity),
  }),
  fromCapsule: (doc) => ({
    ...Object.fromEntries(VENUE_TEXT.map((f) => [f, text(doc[f])])),
    // Create stores 0 when the source had no capacity.
    capacity: num(doc.capacity) === 0 ? null : num(doc.capacity),
  }),
};

export const SOURCE_FIELD_MAPS: Record<SourceDeltaDataset, SourceFieldMap> = {
  contacts: CONTACT_FIELDS,
  venues: VENUE_FIELDS,
};

/** Recordtype on the link → dataset, for screens that start from a link. */
export const DATASET_BY_RECORD_TYPE: Record<string, SourceDeltaDataset> = {
  contact: "contacts",
  venue: "venues",
};

/**
 * Short, stable fingerprint of the compared source values. Two runs of the
 * same source row give the same version; any change in a compared field
 * gives a new one.
 */
export function sourceVersionOf(values: Values): string {
  const keys = Object.keys(values).sort();
  const body = JSON.stringify(keys.map((k) => [k, values[k] ?? null]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < body.length; i += 1) {
    hash ^= body.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `v-${hash.toString(16).padStart(8, "0")}`;
}

/** Stored values on a link or conflict row are JSON; null when unreadable. */
export function parseValues(raw: string | null | undefined): Values | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Values)
      : null;
  } catch {
    return null;
  }
}

/** One value as stored on an ImportConflict row (JSON text, or null). */
export const storeValue = (value: FieldValue): string | null =>
  value == null ? null : JSON.stringify(value);

/** Read back a value stored by storeValue. */
export function readStoredValue(raw: string | null | undefined): FieldValue {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as FieldValue;
  } catch {
    return raw;
  }
}
