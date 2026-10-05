/**
 * Event documents (PL-REPORT-RENDERING, AC-141): the BEO, the Event Timeline,
 * the Event Worksheet and the Heating & Serving menu each print their own
 * sections - they do not all print one generic event menu. A section with
 * nothing in it, or that the reader may not see, says so in a row instead of
 * disappearing, so a missing fact is never mistaken for "none".
 */
import type { TppDocumentSection } from "../../features/reports/tpp/types";

export type EventDocumentTemplate =
  | "event-beo"
  | "event-timeline"
  | "event-worksheet"
  | "heating-serving-event-menu";

export type EventDocumentSectionId =
  | "event"
  | "service"
  | "venue"
  | "menu"
  | "heating"
  | "timeline"
  | "staff"
  | "equipment"
  | "rentals"
  | "notes";

type Row = TppDocumentSection["rows"][number];

export type EventDocumentInput = {
  readonly header: readonly Row[];
  /** Section rows, or null when the reader's role may not see that record. */
  readonly rows: Readonly<
    Record<Exclude<EventDocumentSectionId, "event">, readonly Row[] | null>
  >;
};

export const EVENT_DOCUMENT_SECTIONS: Readonly<
  Record<EventDocumentTemplate, readonly EventDocumentSectionId[]>
> = {
  // Banquet Event Order: everything the floor needs for the day.
  "event-beo": [
    "event",
    "service",
    "venue",
    "menu",
    "timeline",
    "staff",
    "equipment",
    "notes",
  ],
  // Timeline: when things happen and who is there.
  "event-timeline": ["event", "venue", "timeline", "staff"],
  // Worksheet: food, beverage, rentals, misc and staffing in one view.
  "event-worksheet": [
    "event",
    "service",
    "menu",
    "staff",
    "equipment",
    "rentals",
    "notes",
  ],
  // Heating & Serving: each dish and how to heat and serve it.
  "heating-serving-event-menu": ["event", "heating"],
};

const HEADINGS: Record<EventDocumentSectionId, string> = {
  event: "Event",
  service: "Service and setup",
  venue: "Venue and load-in",
  menu: "Menu",
  heating: "Heating and serving",
  timeline: "Timeline",
  staff: "Staffing",
  equipment: "Equipment",
  rentals: "Rented from vendors",
  notes: "Notes",
};

const EMPTY: Record<Exclude<EventDocumentSectionId, "event">, string> = {
  service: "No service or setup answers on this event yet.",
  venue: "No venue picked for this event yet.",
  menu: "No dishes on this event's menu yet.",
  heating: "No dishes on this event's menu yet.",
  timeline: "No timeline steps on this event yet.",
  staff: "Nobody is on this event's crew yet.",
  equipment: "No equipment held for this event yet.",
  rentals: "Nothing rented from vendors for this event.",
  notes: "No service or setup notes on this event.",
};

const HIDDEN: Record<Exclude<EventDocumentSectionId, "event">, string> = {
  service: "Your role can't see this event's service answers.",
  venue: "Your role can't see venue details.",
  menu: "Your role can't see this event's menu.",
  heating: "Your role can't see this event's menu.",
  timeline: "Your role can't see this event's timeline.",
  staff: "Your role can't see this event's crew.",
  equipment: "Your role can't see equipment holds.",
  rentals: "Your role can't see vendor rentals.",
  notes: "Your role can't see this event's notes.",
};

/** The template's sections in order, each with rows or a named reason. */
export function eventDocumentSections(
  template: EventDocumentTemplate,
  input: EventDocumentInput,
): TppDocumentSection[] {
  return EVENT_DOCUMENT_SECTIONS[template].map((id) => {
    if (id === "event") {
      return {
        id,
        heading:
          template === "event-beo" ? "Banquet Event Order" : HEADINGS.event,
        rows: input.header,
      };
    }
    const rows = input.rows[id];
    const shown = rows?.filter((row) => row.value.trim().length > 0) ?? null;
    return {
      // The serving menu's dish list keeps the section name print and
      // export already read ("menu").
      id: id === "heating" ? "menu" : id,
      heading: HEADINGS[id],
      rows:
        shown == null
          ? [{ label: "Not shown", value: HIDDEN[id] }]
          : shown.length === 0
            ? [{ label: "Not on file", value: EMPTY[id] }]
            : shown,
    };
  });
}

/** Service and setup answers worth printing, with the unanswered ones named. */
export function serviceRows(
  answers: ReadonlyArray<
    readonly [label: string, value: string | boolean | null | undefined]
  >,
): Row[] {
  const rows: Row[] = [];
  const missing: string[] = [];
  for (const [label, value] of answers) {
    const text =
      value === true ? "Yes" : value === false ? "No" : (value ?? "").trim();
    if (text) rows.push({ label, value: text });
    else missing.push(label.toLowerCase());
  }
  if (rows.length > 0 && missing.length > 0) {
    rows.push({ label: "Not answered yet", value: missing.join(", ") });
  }
  return rows;
}
