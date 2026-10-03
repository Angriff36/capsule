// PL-SOURCE-DELTA (AC-272, AC-273): which fields a repeat import compares for
// each dataset, read from the parsed source row and from the Capsule record.
// The three-way rule itself lives in culinaryModel/importMapping.ts
// (threeWayReconcile); this file only names the fields and how to read them.
import type { FieldValue } from "./culinaryModel/importMapping";
import { PACK_LIST_FIELDS } from "./importPackListLines";

export type SourceDeltaDataset =
  | "contacts"
  | "companies"
  | "venues"
  | "events"
  | "leads"
  | "menus"
  | "pack_lists";

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
  /**
   * Fields Capsule never leaves blank. A source row that blanks one leaves
   * Capsule as it is, and the import does not count the blank as applied
   * (#409), so a later real value is not a false review item.
   */
  required?: readonly string[];
  /** Plain words for the review list. */
  labels: Record<string, string>;
  fromSource(row: Row): Values;
  fromCapsule(doc: Row): Values;
  /**
   * For a record whose compared fields depend on the row (one per pack list
   * line): the fields to compare, given the last import and the new source.
   */
  fieldsFor?(applied: Values | null, source: Values): string[];
  /** Per-field write rule, when `writable` cannot name the fields up front. */
  canWrite?(field: string, value: FieldValue): boolean;
  /** Per-field label, when `labels` cannot name the fields up front. */
  labelFor?(field: string): string;
}

/** Plain words for one compared field. */
export const fieldLabel = (map: SourceFieldMap, field: string): string =>
  map.labels[field] ?? map.labelFor?.(field) ?? field;

/** May the import (or "Use the new value") write this value into Capsule? */
export const fieldWritable = (
  map: SourceFieldMap,
  field: string,
  value: FieldValue,
): boolean =>
  map.canWrite ? map.canWrite(field, value) : map.writable.includes(field);

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

// Company rows of the contacts import (TPP_COMPANY_MAPPINGS). The billing
// address follows the old system; the name, tax id and payment terms are
// billing facts a person checks, so a change there waits on the review list.
const COMPANY_ADDRESS = [
  "addressLine1",
  "city",
  "region",
  "postalCode",
] as const;

const COMPANY_FIELDS: SourceFieldMap = {
  fields: ["companyName", ...COMPANY_ADDRESS, "taxId", "paymentTermsDays"],
  writable: [...COMPANY_ADDRESS],
  labels: {
    companyName: "Company name",
    addressLine1: "Street address",
    city: "City",
    region: "State",
    postalCode: "ZIP code",
    taxId: "Tax ID",
    paymentTermsDays: "Payment terms (days)",
  },
  fromSource: (row) => {
    const company = (row.company ?? {}) as Row;
    return {
      companyName: text(company.name),
      ...Object.fromEntries(COMPANY_ADDRESS.map((f) => [f, text(row[f])])),
      taxId: text(company.taxId),
      paymentTermsDays: num(company.paymentTermsDays),
    };
  },
  fromCapsule: (doc) => ({
    companyName: text(doc.companyName),
    ...Object.fromEntries(COMPANY_ADDRESS.map((f) => [f, text(doc[f])])),
    taxId: text(doc.taxId),
    paymentTermsDays: num(doc.paymentTermsDays),
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
  "loadInInstructions",
  "logisticsNotes",
] as const;

const VENUE_FIELDS: SourceFieldMap = {
  fields: [...VENUE_TEXT, "capacity"],
  writable: [...VENUE_TEXT, "capacity"],
  required: ["name"],
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
    loadInInstructions: "Load-in instructions",
    logisticsNotes: "Parking",
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

/**
 * TPP SpecialRequirements and EventNotes both land in the event's
 * requirements (Event has no second notes field), so neither is lost.
 */
export function eventRequirementsText(row: Row): string | undefined {
  const parts = [text(row.operationalRequirements), text(row.notes)].filter(
    (part): part is string => typeof part === "string",
  );
  return parts.length > 0 ? [...new Set(parts)].join("\n\n") : undefined;
}

// Events: the same shaping importCommit applies at create (a missing or
// backwards end is one hour after the start; at least one guest; special
// requirements and notes together). Money fields are not compared here.
const HOUR = 3_600_000;
const EVENT_FIELDS: SourceFieldMap = {
  fields: [
    "title",
    "startsAt",
    "endsAt",
    "expectedHeadcount",
    "venueName",
    "venueAddress",
    "operationalRequirements",
  ],
  writable: [
    "startsAt",
    "endsAt",
    "expectedHeadcount",
    "venueName",
    "venueAddress",
    "operationalRequirements",
  ],
  required: ["startsAt", "endsAt"],
  labels: {
    title: "Event name",
    startsAt: "Start time",
    endsAt: "End time",
    expectedHeadcount: "Guest count",
    venueName: "Venue name",
    venueAddress: "Venue address",
    operationalRequirements: "Event notes",
  },
  fromSource: (row) => {
    const startsAt = num(row.startsAt);
    const endsAt = num(row.endsAt);
    const guests = num(row.expectedHeadcount);
    return {
      title: text(row.title),
      startsAt,
      endsAt:
        typeof startsAt === "number" &&
        (typeof endsAt !== "number" || endsAt <= startsAt)
          ? startsAt + HOUR
          : endsAt,
      expectedHeadcount: Math.max(1, typeof guests === "number" ? guests : 1),
      venueName: text(row.venueName),
      venueAddress: text(row.venueAddress),
      operationalRequirements: eventRequirementsText(row) ?? null,
    };
  },
  fromCapsule: (doc) => ({
    title: text(doc.title),
    startsAt: num(doc.startsAt),
    endsAt: num(doc.endsAt),
    expectedHeadcount: num(doc.expectedHeadcount),
    venueName: text(doc.venueName),
    venueAddress: text(doc.venueAddress),
    operationalRequirements: text(doc.operationalRequirements),
  }),
};

// Leads: the sales estimate and chance are shown for review, never written.
const LEAD_FIELDS: SourceFieldMap = {
  fields: ["companyName", "source", "estimatedValue", "probability"],
  writable: ["companyName", "source"],
  required: ["source"],
  labels: {
    companyName: "Lead name",
    source: "Where the lead came from",
    estimatedValue: "Estimated value",
    probability: "Chance of booking",
  },
  fromSource: (row) => ({
    companyName: text(row.opportunityName),
    source: text(row.source),
    estimatedValue: num(row.estimatedValue),
    probability: num(row.probability),
  }),
  fromCapsule: (doc) => ({
    companyName: text(doc.companyName),
    source: text(doc.source),
    estimatedValue: num(doc.estimatedValue),
    probability: num(doc.probability),
  }),
};

const list = (value: unknown): FieldValue =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .sort()
    : [];

// Dishes: allergens are food safety, so a change always waits for a person.
const DISH_FIELDS: SourceFieldMap = {
  fields: [
    "name",
    "description",
    "category",
    "serviceStyle",
    "dietaryTags",
    "portionSize",
    "allergenSummary",
  ],
  writable: [
    "name",
    "description",
    "category",
    "serviceStyle",
    "dietaryTags",
    "portionSize",
  ],
  required: ["name", "portionSize"],
  labels: {
    name: "Dish name",
    description: "Description",
    category: "Category",
    serviceStyle: "Service style",
    dietaryTags: "Diet tags",
    portionSize: "Portion size",
    allergenSummary: "Allergens",
  },
  fromSource: (row) => ({
    name: text(row.name),
    description: text(row.description),
    category: text(row.category),
    serviceStyle: text(row.serviceStyle),
    dietaryTags: list(row.dietaryTags),
    portionSize: num(row.portionSize),
    allergenSummary: list(row.allergenSummary),
  }),
  fromCapsule: (doc) => ({
    name: text(doc.name),
    description: text(doc.description),
    category: text(doc.category),
    serviceStyle: text(doc.serviceStyle),
    dietaryTags: list(doc.dietaryTags),
    portionSize: num(doc.portionSize),
    allergenSummary: list(doc.allergenSummary),
  }),
};

export const SOURCE_FIELD_MAPS: Record<SourceDeltaDataset, SourceFieldMap> = {
  contacts: CONTACT_FIELDS,
  companies: COMPANY_FIELDS,
  venues: VENUE_FIELDS,
  events: EVENT_FIELDS,
  leads: LEAD_FIELDS,
  menus: DISH_FIELDS,
  pack_lists: PACK_LIST_FIELDS,
};

/** Recordtype on the link → dataset, for screens that start from a link. */
export const DATASET_BY_RECORD_TYPE: Record<string, SourceDeltaDataset> = {
  contact: "contacts",
  company: "companies",
  venue: "venues",
  event: "events",
  lead: "leads",
  menu: "menus",
  pack_list: "pack_lists",
};

/** Plain words for a stored value on the review list. */
export function describeValue(field: string, value: FieldValue): string {
  if (value == null || value === "") return "(blank)";
  if ((field === "startsAt" || field === "endsAt") && typeof value === "number") {
    return new Date(value).toLocaleString();
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "(none)" : value.join(", ");
  }
  return String(value);
}

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
