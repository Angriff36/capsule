// PL-CUTOVER (AC-285, AC-286): the daily TPP vs Capsule comparison rules.
// One TPP event (from its link's saved source row) is compared with the
// Capsule event the link names, field by field. Both sides' totals come from
// the same rows, so the page's numbers and the difference list agree.
// Shared by convex/parallelRun.ts (the daily job) and the tests.

/** What TPP said about one event (the import's normalized row). */
export interface TppEventSide {
  externalId: string;
  title?: string;
  startsAt?: number;
  expectedHeadcount?: number;
  quotedRevenue?: number;
  stage?: string;
  /** TPP salesperson id. */
  assignedToId?: string;
  /** TPP event type, folded to a slug by the import. */
  occasionId?: string;
  /** TPP service style, folded to a slug by the import. */
  serviceStyleId?: string;
  /** TPP venue id. */
  venueId?: string;
  venueName?: string;
}

/** The Capsule event the link names, with names already looked up. */
export interface CapsuleEventSide {
  id: string;
  title?: string;
  removed: boolean;
  startsAt?: number | null;
  expectedHeadcount?: number | null;
  quotedPrice?: number | null;
  stage?: string;
  assignedToId?: string | null;
  assignedToName?: string;
  eventType?: string | null;
  serviceStyleName?: string | null;
  venueId?: string | null;
  venueName?: string | null;
}

/** TPP ids matched to Capsule records by earlier imports. */
export interface IdentityLookups {
  /** TPP salesperson id -> Capsule person id and name. */
  salesperson(tppId: string): { id: string; name: string } | undefined;
  /** TPP venue id -> Capsule venue id. */
  venue(tppId: string): string | undefined;
}

export type DifferenceField =
  | "record"
  | "date"
  | "guests"
  | "price"
  | "stage"
  | "salesperson"
  | "occasion"
  | "service_style"
  | "venue";

export interface FieldDifference {
  field: DifferenceField;
  sourceValue: string;
  capsuleValue: string;
}

export const DIFFERENCE_FIELD_WORDS: Record<DifferenceField, string> = {
  record: "Event",
  date: "Date and time",
  guests: "Guests",
  price: "Price",
  stage: "Stage",
  salesperson: "Salesperson",
  occasion: "Occasion",
  service_style: "Service style",
  venue: "Venue",
};

const EMPTY = "(none)";

export function slug(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function when(ms: number | null | undefined): string {
  if (ms == null) return EMPTY;
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function money(value: number | null | undefined): string {
  return value == null
    ? EMPTY
    : `$${(Math.round(value * 100) / 100).toFixed(2)}`;
}

function cents(value: number | null | undefined): number {
  return Math.round((value ?? 0) * 100);
}

/** Every field where TPP and Capsule disagree for one event. */
export function compareEventPair(
  tpp: TppEventSide,
  capsule: CapsuleEventSide | null,
  lookups: IdentityLookups,
): FieldDifference[] {
  if (!capsule || capsule.removed) {
    return [
      {
        field: "record",
        sourceValue: "In TPP",
        capsuleValue: "Removed in Capsule",
      },
    ];
  }
  const out: FieldDifference[] = [];
  const push = (field: DifferenceField, source: string, mine: string) =>
    out.push({ field, sourceValue: source, capsuleValue: mine });

  if (tpp.startsAt != null && tpp.startsAt !== capsule.startsAt) {
    push("date", when(tpp.startsAt), when(capsule.startsAt));
  }
  if (
    tpp.expectedHeadcount != null &&
    tpp.expectedHeadcount > 0 &&
    tpp.expectedHeadcount !== capsule.expectedHeadcount
  ) {
    push(
      "guests",
      String(tpp.expectedHeadcount),
      capsule.expectedHeadcount == null
        ? EMPTY
        : String(capsule.expectedHeadcount),
    );
  }
  if (
    tpp.quotedRevenue != null &&
    cents(tpp.quotedRevenue) !== cents(capsule.quotedPrice)
  ) {
    push("price", money(tpp.quotedRevenue), money(capsule.quotedPrice));
  }
  if (tpp.stage && tpp.stage !== capsule.stage) {
    push("stage", tpp.stage, capsule.stage ?? EMPTY);
  }
  if (tpp.assignedToId) {
    // Compared by identity only: a TPP salesperson nobody matched to a
    // Capsule person cannot be checked one event at a time.
    const person = lookups.salesperson(tpp.assignedToId);
    if (person && person.id !== capsule.assignedToId) {
      push("salesperson", person.name, capsule.assignedToName ?? EMPTY);
    }
  }
  if (tpp.occasionId && slug(tpp.occasionId) !== slug(capsule.eventType)) {
    push("occasion", tpp.occasionId, capsule.eventType || EMPTY);
  }
  if (
    tpp.serviceStyleId &&
    slug(tpp.serviceStyleId) !== slug(capsule.serviceStyleName)
  ) {
    push(
      "service_style",
      tpp.serviceStyleId,
      capsule.serviceStyleName || EMPTY,
    );
  }
  const venueId = tpp.venueId ? lookups.venue(tpp.venueId) : undefined;
  if (venueId) {
    if (venueId !== capsule.venueId) {
      push("venue", tpp.venueName || tpp.venueId!, capsule.venueName || EMPTY);
    }
  } else if (tpp.venueName && slug(tpp.venueName) !== slug(capsule.venueName)) {
    push("venue", tpp.venueName, capsule.venueName || EMPTY);
  }
  return out;
}

export interface SideTotals {
  events: number;
  revenue: number;
  byStage: Record<string, number>;
  bySalesperson: Record<string, number>;
  byOccasion: Record<string, number>;
  byServiceStyle: Record<string, number>;
  byVenue: Record<string, number>;
}

export interface ComparisonSummary {
  windowStart: number;
  tpp: SideTotals;
  capsule: SideTotals;
  /** TPP events in the window with no Capsule event yet. */
  onlyInTpp: number;
  /** Capsule events in the window TPP does not have (made in Capsule). */
  onlyInCapsule: number;
}

function emptyTotals(): SideTotals {
  return {
    events: 0,
    revenue: 0,
    byStage: {},
    bySalesperson: {},
    byOccasion: {},
    byServiceStyle: {},
    byVenue: {},
  };
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

const NOT_SET = "Not set";

export function addTppEvent(
  totals: SideTotals,
  tpp: TppEventSide,
  lookups: IdentityLookups,
) {
  totals.events += 1;
  totals.revenue += tpp.quotedRevenue ?? 0;
  bump(totals.byStage, tpp.stage || NOT_SET);
  bump(
    totals.bySalesperson,
    tpp.assignedToId
      ? (lookups.salesperson(tpp.assignedToId)?.name ??
          `TPP salesperson ${tpp.assignedToId}`)
      : NOT_SET,
  );
  bump(totals.byOccasion, slug(tpp.occasionId) || NOT_SET);
  bump(totals.byServiceStyle, slug(tpp.serviceStyleId) || NOT_SET);
  bump(totals.byVenue, slug(tpp.venueName) || NOT_SET);
}

export function addCapsuleEvent(totals: SideTotals, event: CapsuleEventSide) {
  totals.events += 1;
  totals.revenue += event.quotedPrice ?? 0;
  bump(totals.byStage, event.stage || NOT_SET);
  bump(totals.bySalesperson, event.assignedToName || NOT_SET);
  bump(totals.byOccasion, slug(event.eventType) || NOT_SET);
  bump(totals.byServiceStyle, slug(event.serviceStyleName) || NOT_SET);
  bump(totals.byVenue, slug(event.venueName) || NOT_SET);
}

export function newSummary(windowStart: number): ComparisonSummary {
  return {
    windowStart,
    tpp: emptyTotals(),
    capsule: emptyTotals(),
    onlyInTpp: 0,
    onlyInCapsule: 0,
  };
}

/** Reads a TPP link's saved source row; null when it is not an event row. */
export function tppEventFromRaw(
  raw: string | null | undefined,
): TppEventSide | null {
  if (!raw) return null;
  try {
    const row = JSON.parse(raw) as Record<string, unknown>;
    if (typeof row.externalId !== "string") return null;
    const text = (key: string) =>
      typeof row[key] === "string" && (row[key] as string).trim()
        ? (row[key] as string).trim()
        : undefined;
    const num = (key: string) =>
      typeof row[key] === "number" && Number.isFinite(row[key])
        ? (row[key] as number)
        : undefined;
    return {
      externalId: row.externalId,
      title: text("title"),
      startsAt: num("startsAt"),
      expectedHeadcount: num("expectedHeadcount"),
      quotedRevenue: num("quotedRevenue"),
      stage: text("stage"),
      assignedToId: text("assignedToId"),
      occasionId: text("occasionId"),
      serviceStyleId: text("serviceStyleId"),
      venueId: text("venueId"),
      venueName: text("venueName"),
    };
  } catch {
    return null;
  }
}

/** Should a saved difference stay, reopen, or clear after today's look? */
export function nextDifferenceStatus(
  current: "open" | "fixed" | "accepted" | "cleared",
  sameValuesAsBefore: boolean,
  stillDiffers: boolean,
): "open" | "fixed" | "accepted" | "cleared" {
  if (!stillDiffers) return "cleared";
  if (current === "open") return "open";
  // Someone said it is fine and nothing moved since: it stays settled.
  if (current === "accepted" && sameValuesAsBefore) return "accepted";
  // "Fixed" but still different, a changed value, or a difference that came
  // back after it cleared: a person looks again.
  return "open";
}
