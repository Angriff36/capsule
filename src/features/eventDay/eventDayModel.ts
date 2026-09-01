import type {
  EventDayAssignment,
  EventDayClientContact,
  EventDayDelivery,
  EventDayEquipmentReservation,
  EventDayEvent,
  EventDayEventDish,
  EventDayLayoutSection,
  EventDayPackList,
  EventDayPackListItem,
  EventDayStaffNeed,
  EventDayActivity,
  EventDayVenue,
} from "../../lib/eventDayBriefing";

/**
 * Event Day — pure status derivation.
 *
 * The world map shows nine sections. Each gets one of five treatments
 * (the visual spec in public/assets/event-day/world): ready (green),
 * active (blue), review (amber), blocked (red), dormant (dimmed).
 * Sections start dormant and light up as the real records complete,
 * so a dark card is always a card that still needs work.
 */

export type EventDaySectionKey =
  | "venue"
  | "staffing"
  | "timeline"
  | "menu"
  | "vehicles"
  | "layouts"
  | "equipment"
  | "contacts"
  | "packlist";

export type EventDayStatus =
  "ready" | "active" | "review" | "blocked" | "dormant";

export type EventDaySection = {
  key: EventDaySectionKey;
  label: string;
  status: EventDayStatus;
  /** Short state line rendered under the label, e.g. "3 of 5 confirmed". */
  caption: string;
};

export type EventDayTrayItem = {
  key: EventDaySectionKey;
  label: string;
  caption: string;
};

export type EventDaySummary = {
  sections: EventDaySection[];
  /** 0..100 overall readiness for the ring. */
  readinessPct: number;
  /** Ring subtitle: "On track", "Needs review", "Blocked", "Show ready". */
  ringLabel: string;
  ringTone: "ok" | "warn" | "danger";
  /** Whole days until startsAt; 0 = today, negative = past. */
  daysOut: number | null;
  now: EventDayTrayItem | null;
  next: EventDayTrayItem | null;
  blockers: EventDayTrayItem[];
};

export type EventDayInputs = {
  event: EventDayEvent;
  venue: EventDayVenue | undefined;
  assignments: readonly EventDayAssignment[];
  staffNeeds: readonly EventDayStaffNeed[];
  activities: readonly EventDayActivity[];
  eventDishes: readonly EventDayEventDish[];
  deliveries: readonly EventDayDelivery[];
  layoutSections: readonly EventDayLayoutSection[];
  equipmentReservations: readonly EventDayEquipmentReservation[];
  clientContacts: readonly EventDayClientContact[];
  packLists: readonly EventDayPackList[];
  packListItems: readonly EventDayPackListItem[];
};

export const SECTION_LABELS: Record<EventDaySectionKey, string> = {
  venue: "Venue",
  staffing: "Staffing",
  timeline: "Timeline",
  menu: "Menu",
  vehicles: "Vehicles",
  layouts: "Layouts",
  equipment: "Equipment",
  contacts: "Contacts",
  packlist: "Pack list",
};

/** Sections a real event cannot run without; empty = blocked near showtime. */
const CRITICAL = new Set<EventDaySectionKey>([
  "venue",
  "staffing",
  "timeline",
  "menu",
  "contacts",
  "packlist",
]);

const STAGE_RANK: Record<string, number> = {
  quote: 0,
  planning: 1,
  pending_approval: 2,
  approved: 3,
  sales_lock: 4,
  final: 5,
  executing: 6,
  completed: 7,
  closed_out: 8,
};

const STATUS_SCORE: Record<EventDayStatus, number> = {
  ready: 1,
  active: 0.55,
  review: 0.35,
  blocked: 0.15,
  dormant: 0,
};

/** Priority for the Now/Next tray: what a crew chases first. */
const TRAY_PRIORITY: EventDaySectionKey[] = [
  "packlist",
  "staffing",
  "timeline",
  "menu",
  "vehicles",
  "equipment",
  "contacts",
  "layouts",
  "venue",
];

function stageRank(stage: unknown): number {
  return STAGE_RANK[String(stage)] ?? 0;
}

/** Empty critical sections turn from dormant to blocked once the plan is final. */
function emptyStatus(key: EventDaySectionKey, rank: number): EventDayStatus {
  return CRITICAL.has(key) && rank >= STAGE_RANK.final ? "blocked" : "dormant";
}

function section(
  key: EventDaySectionKey,
  status: EventDayStatus,
  caption: string,
): EventDaySection {
  return { key, label: SECTION_LABELS[key], status, caption };
}

export function deriveSections(inputs: EventDayInputs): EventDaySection[] {
  const { event } = inputs;
  const rank = stageRank(event.stage);
  const out: EventDaySection[] = [];

  // Venue
  const venueKnown =
    event.venueId != null || String(event.venueName ?? "").trim().length > 0;
  if (!venueKnown) {
    out.push(section("venue", emptyStatus("venue", rank), "Not set"));
  } else {
    const place =
      inputs.venue?.city ?? inputs.venue?.name ?? event.venueName ?? "";
    out.push(section("venue", "ready", String(place) || "Confirmed"));
  }

  // Staffing
  const crew = inputs.assignments.filter(
    (row) => String(row.status) !== "unassigned",
  );
  const openNeeds = inputs.staffNeeds.filter((row) =>
    ["open", "claimed"].includes(String(row.status)),
  );
  if (crew.length === 0 && openNeeds.length === 0) {
    out.push(
      section("staffing", emptyStatus("staffing", rank), "No staff assigned"),
    );
  } else if (openNeeds.length > 0) {
    out.push(
      section(
        "staffing",
        "review",
        `${openNeeds.length} ${openNeeds.length === 1 ? "role" : "roles"} unfilled`,
      ),
    );
  } else {
    const confirmed = crew.filter((row) =>
      ["confirmed", "checked_in", "checked_out"].includes(String(row.status)),
    );
    out.push(
      confirmed.length === crew.length
        ? section("staffing", "ready", `${crew.length} confirmed`)
        : section(
            "staffing",
            "active",
            `${confirmed.length} of ${crew.length} confirmed`,
          ),
    );
  }

  // Timeline
  const blocks = inputs.activities;
  if (blocks.length === 0) {
    out.push(
      section("timeline", emptyStatus("timeline", rank), "No run of show"),
    );
  } else {
    const timed = blocks.filter((row) => row.startsAt != null);
    out.push(
      timed.length === blocks.length
        ? section("timeline", "ready", `${blocks.length} activities`)
        : section(
            "timeline",
            "active",
            `${timed.length} of ${blocks.length} timed`,
          ),
    );
  }

  // Menu — dishes are final once sales locks the event.
  const dishes = inputs.eventDishes;
  if (dishes.length === 0) {
    out.push(section("menu", emptyStatus("menu", rank), "No dishes"));
  } else if (rank >= STAGE_RANK.sales_lock) {
    out.push(section("menu", "ready", `${dishes.length} dishes`));
  } else {
    out.push(section("menu", "active", `${dishes.length} planned`));
  }

  // Vehicles — driven by deliveries; an event may honestly have none.
  const runs = inputs.deliveries.filter(
    (row) => String(row.status) !== "cancelled",
  );
  if (runs.length === 0) {
    out.push(section("vehicles", "dormant", "No deliveries"));
  } else {
    const failed = runs.filter((row) => String(row.status) === "failed");
    const unassigned = runs.filter(
      (row) => row.vehicleId == null || row.driverId == null,
    );
    if (failed.length > 0) {
      out.push(
        section(
          "vehicles",
          "blocked",
          `${failed.length} ${failed.length === 1 ? "run" : "runs"} failed`,
        ),
      );
    } else if (unassigned.length > 0) {
      out.push(
        section("vehicles", "review", `${unassigned.length} unassigned`),
      );
    } else {
      out.push(
        section(
          "vehicles",
          rank >= STAGE_RANK.final ? "ready" : "active",
          `${runs.length} ${runs.length === 1 ? "run" : "runs"}`,
        ),
      );
    }
  }

  // Layouts
  const layout = inputs.layoutSections;
  if (layout.length === 0) {
    out.push(section("layouts", "dormant", "No layout"));
  } else {
    out.push(
      section(
        "layouts",
        rank >= STAGE_RANK.final ? "ready" : "active",
        `${layout.length} sections`,
      ),
    );
  }

  // Equipment
  const reserved = inputs.equipmentReservations.filter(
    (row) => String(row.status) !== "cancelled",
  );
  if (reserved.length === 0) {
    out.push(section("equipment", "dormant", "Nothing reserved"));
  } else {
    const pieces = reserved.reduce(
      (sum, row) => sum + (Number(row.quantity) || 1),
      0,
    );
    out.push(
      section(
        "equipment",
        rank >= STAGE_RANK.final ? "ready" : "active",
        `${pieces} ${pieces === 1 ? "item" : "items"}`,
      ),
    );
  }

  // Contacts — someone reachable on the day matters most.
  const named = String(event.primaryContactName ?? "").trim().length > 0;
  const contactRows = inputs.clientContacts;
  const phones = [
    event.primaryContactPhone,
    inputs.venue?.contactPhone,
    ...contactRows.map((row) => row.phone ?? row.mobile),
  ].filter((value) => String(value ?? "").trim().length > 0);
  if (!named && contactRows.length === 0) {
    out.push(section("contacts", emptyStatus("contacts", rank), "No contacts"));
  } else if (phones.length === 0) {
    out.push(section("contacts", "review", "No day-of phone"));
  } else {
    const count = (named ? 1 : 0) + contactRows.length;
    out.push(
      section(
        "contacts",
        "ready",
        `${count} ${count === 1 ? "contact" : "contacts"}`,
      ),
    );
  }

  // Pack list
  const lists = inputs.packLists.filter(
    (row) => String(row.status) !== "cancelled",
  );
  if (lists.length === 0) {
    out.push(
      section("packlist", emptyStatus("packlist", rank), "No pack list"),
    );
  } else {
    const listIds = new Set(lists.map((row) => row._id));
    const items = inputs.packListItems.filter((row) =>
      listIds.has(row.packListId),
    );
    const missing = items.filter((row) => String(row.status) === "missing");
    const packed = items.filter((row) => String(row.status) === "packed");
    const settled = lists.every((row) =>
      ["packed", "loaded", "dispatched"].includes(String(row.status)),
    );
    if (missing.length > 0) {
      out.push(
        section(
          "packlist",
          "blocked",
          `${missing.length} ${missing.length === 1 ? "item" : "items"} missing`,
        ),
      );
    } else if (settled) {
      out.push(section("packlist", "ready", `${packed.length} packed`));
    } else {
      out.push(
        section(
          "packlist",
          "active",
          items.length > 0
            ? `${packed.length} of ${items.length} packed`
            : "Packing",
        ),
      );
    }
  }

  return out;
}

function startOfDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function deriveEventDay(
  inputs: EventDayInputs,
  nowMs = Date.now(),
): EventDaySummary {
  const sections = deriveSections(inputs);

  // Non-critical dormant sections (no deliveries, no equipment…) are absent,
  // not unfinished — leave them out of the score so they never cap the ring.
  const scored = sections.filter(
    (row) => CRITICAL.has(row.key) || row.status !== "dormant",
  );
  const total = scored.reduce((sum, row) => sum + STATUS_SCORE[row.status], 0);
  const readinessPct =
    scored.length === 0 ? 0 : Math.round((total / scored.length) * 100);

  const blockers = sections
    .filter((row) => row.status === "blocked")
    .map((row) => ({ key: row.key, label: row.label, caption: row.caption }));
  const anyReview = sections.some((row) => row.status === "review");
  const ringTone =
    blockers.length > 0 ? "danger" : anyReview ? "warn" : ("ok" as const);
  const ringLabel =
    blockers.length > 0
      ? "Blocked"
      : anyReview
        ? "Needs review"
        : readinessPct >= 100
          ? "Show ready"
          : readinessPct >= 70
            ? "On track"
            : "In motion";

  const startsAt = Number(inputs.event.startsAt);
  const daysOut = Number.isFinite(startsAt)
    ? Math.round((startOfDay(startsAt) - startOfDay(nowMs)) / 86_400_000)
    : null;

  // Now = highest-priority unfinished section; Next = the one after it.
  const open = TRAY_PRIORITY.map((key) =>
    sections.find(
      (row) =>
        row.key === key && (row.status === "active" || row.status === "review"),
    ),
  ).filter((row): row is EventDaySection => row != null);
  const toTray = (row: EventDaySection): EventDayTrayItem => ({
    key: row.key,
    label: row.label,
    caption: row.caption,
  });
  const now = open[0] ? toTray(open[0]) : null;
  const next = open[1] ? toTray(open[1]) : null;

  return {
    sections,
    readinessPct,
    ringLabel,
    ringTone,
    daysOut,
    now,
    next,
    blockers,
  };
}
