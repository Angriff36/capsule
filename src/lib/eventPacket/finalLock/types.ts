import type { Section } from "../model";

/** The four results a Final Lock question can have (spec §14.2). */
export type FinalLockResult =
  "answered" | "not_applicable" | "unresolved" | "field_confirmation";

/** Typed answer value; `none` only for unresolved and field work. */
export type FinalLockValue =
  | { type: "text"; text: string }
  | { type: "yes_no"; yes: boolean }
  | { type: "choice"; choice: string }
  | { type: "count"; count: number }
  | { type: "list"; items: string[] }
  | { type: "times"; times: Record<string, number | null> }
  | {
      type: "record";
      fields: Record<string, string | number | boolean | null>;
    }
  | { type: "none" };

export type FinalLockGroup =
  | "identity"
  | "menu"
  | "timeline"
  | "setup"
  | "servingware"
  | "rentals"
  | "room"
  | "food"
  | "bussing"
  | "dessert"
  | "beverage"
  | "buffet"
  | "vehicles"
  | "communication"
  | "readiness"
  | "field";

export type Resolver = "Sales" | "Operations" | "Kitchen" | "Logistics";

/** A native record an answer was read from, at the version it was read. */
export interface AnswerSource {
  table: string;
  id: string;
  version: number | null;
  field?: string;
}

export interface AnswerOverride {
  value: FinalLockValue;
  reason: string;
  actor: string;
  at: string;
}

export interface FieldWork {
  form: string;
  dueAt: number | null;
  confirmedAt: string | null;
  confirmedBy: string | null;
  /** Set up for the day (a FieldConfirmation exists), who does it, chased. */
  prepared?: boolean;
  responsible?: string | null;
  status?: "not_set_up" | "open" | "first_signed" | "done";
  escalatedAt?: string | null;
}

/** A day-of form the office set up (FieldConfirmation), as read for Final Lock. */
export interface FieldFormState {
  status: "open" | "first_signed" | "done";
  dueAt: number | null;
  responsible: string | null;
  escalatedAt: string | null;
}

export interface FinalLockAnswer {
  questionKey: string;
  group: FinalLockGroup;
  section: Section;
  label: string;
  policyVersion: string;
  ruleVersion: number;
  result: FinalLockResult;
  value: FinalLockValue;
  explanation: string;
  sources: AnswerSource[];
  rule: string;
  /** Exact missing or contradictory facts (unresolved only). */
  missing: string[];
  /** The one action that resolves it (unresolved only). */
  action: string | null;
  resolver: Resolver;
  override: AnswerOverride | null;
  fieldWork: FieldWork | null;
  /** Packet revision that printed this exact answer, if any. */
  displayedInRevision: string | null;
  /** Stable text of what the answer says; a change marks it stale. */
  fingerprint: string;
  /** Fingerprint of the derived answer; an override must name it. */
  basis: string;
}

export type FinalLockOutcome =
  "clear" | "needs_review" | "field_work_pending" | "stale";

export interface NativeRow {
  id: string;
  version: number | null;
}

/** Native facts the engine reads. Built by the Convex seam, tested directly. */
export interface FinalLockInput {
  event: NativeRow & {
    title: string;
    eventNumber: string | null;
    stage: string;
    serviceStyleId: string | null;
    serviceStyleName: string | null;
    expectedHeadcount: number | null;
    venueId: string | null;
    venueName: string | null;
    venueAddress: string | null;
    venueCapacity: number | null;
    clientId: string | null;
    /** The customer name the event booked (a later rename does not change it). */
    clientName: string | null;
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
    assignedToId: string | null;
    ownerName: string | null;
    quotedPrice: number | null;
    startsAt: number | null;
    endsAt: number | null;
    serviceStartsAt: number | null;
    timing: {
      setup: number | null;
      load: number | null;
      outbound: number | null;
      cleanup: number | null;
      returnTravel: number | null;
      unload: number | null;
    };
    salesLockedAt: number | null;
    operationalRequirements: string | null;
    /** The event's channel in an outside team chat, when it has one. */
    externalChannel: { name: string; id: string; url: string | null } | null;
    /** Day sheet, setup notes and task breakdown text, keyed by field name. */
    text: Record<string, string | null>;
  };
  serviceStyle: (NativeRow & { name: string }) | null;
  client: (NativeRow & { name: string; status: string }) | null;
  venue:
    | (NativeRow & {
        name: string;
        venueType: string | null;
        loadInInstructions: string | null;
      })
    | null;
  dishes: (NativeRow & {
    name: string;
    course: string | null;
    serviceStyle: string | null;
    sortOrder: number | null;
    quantityServings: number | null;
    followsEventHeadcount: boolean | null;
    notes: string | null;
    /** The dish record the line names (its name can come from there). */
    dish: NativeRow | null;
    /** Cost of one portion from its recipe, when every line's cost is known. */
    portionCost: number | null;
  })[];
  timeline: (NativeRow & {
    name: string;
    milestone: string | null;
    startsAt: number | null;
  })[];
  vehicles: (NativeRow & {
    vehicleId: string | null;
    vehicleName: string | null;
    trailerId: string | null;
    trailerName: string | null;
    driverId: string | null;
    /** What this rig carries, as written on the assignment. */
    notes: string | null;
    preloaded: boolean;
    /** Other events holding the same truck or trailer at an overlapping time. */
    busyWith: (NativeRow & { eventTitle: string })[];
    outOfService: boolean;
  })[];
  equipment: (NativeRow & {
    name: string;
    category: string | null;
    /** The item is rented in, not Mangia's own stock. */
    rented: boolean;
    quantity: number;
    status: string;
    shortBy: number;
    /** A held item marked out of service since it was booked. */
    outOfService?: boolean;
    /** When the reservation ends: a rented line's return window. */
    endsAt: number | null;
    /** The equipment record its name, category and ownership come from. */
    item: NativeRow | null;
  })[];
  packLists: (NativeRow & {
    status: string;
    itemCount: number;
    missingCount: number;
  })[];
  /** Every open line on the event's pack lists. */
  packItems: (NativeRow & {
    description: string;
    /** Not going: retired by its rule, or left off (who covers it, if anyone). */
    retired?: boolean;
    excluded?: boolean;
    coveredBy?: string | null;
    /** Whose pieces the line sends: owned, rented or client. */
    ownership?: string | null;
    /** The style kit item this line came from, if any. */
    kitItemId?: string | null;
  })[];
  /** The event's service style kit (what that style always brings). */
  kitItems: (NativeRow & { description: string })[];
  /** The accepted proposal's line items and extras, if one is accepted. */
  proposal:
    | (NativeRow & {
        lines: (NativeRow & {
          table: string;
          text: string;
          /** Other records the line text is read from (a dish's name). */
          related: AnswerSource[];
        })[];
      })
    | null;
  /** Staff the event asked for (not cancelled). */
  staffNeeds: (NativeRow & { role: string; status: string })[];
  assignments: (NativeRow & { status: string; confirmedAt: number | null })[];
  channel: {
    messageCount: number;
    attachmentCount: number;
    lastMessageId: string | null;
  };
  packet: {
    latestRevisionId: string | null;
    latestRevisionStale: boolean;
    signoffs: {
      key: string;
      actor: string;
      at: string;
      /** The record the sign-off was saved on. */
      source: AnswerSource | null;
    }[];
  };
  /**
   * Physical confirmations signed by people on the day, keyed by form key.
   * Only a completed day-of form (every signature it needs) appears here.
   */
  confirmations: Record<
    string,
    { actor: string; at: string; source: AnswerSource | null }
  >;
  /** Day-of forms the office set up, keyed by form key. */
  fieldForms?: Record<string, FieldFormState>;
}
