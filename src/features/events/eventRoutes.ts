export type EventCreatePrefill = {
  clientId?: string;
  /** Accepted proposal to book: pre-fills the form and links + copies its menu on create. */
  proposalId?: string;
};

export type EventDetailTab =
  | "overview"
  | "chat"
  | "menu"
  | "prep"
  | "equipment"
  | "client"
  | "guests"
  | "photos"
  | "timeline"
  | "todos"
  | "layouts"
  | "staffing"
  | "inventory"
  | "incidents"
  | "history"
  | "margin";

export const EVENT_DETAIL_TABS: readonly {
  key: EventDetailTab;
  label: string;
}[] = [
  { key: "overview", label: "Overview" },
  { key: "chat", label: "Team Chat" },
  { key: "menu", label: "Menu" },
  { key: "prep", label: "Prep" },
  { key: "equipment", label: "Equipment & layouts" },
  { key: "client", label: "Client & guests" },
  { key: "photos", label: "Photos & incidents" },
  { key: "timeline", label: "Timeline & to-dos" },
  { key: "staffing", label: "Staffing" },
  { key: "inventory", label: "Inventory" },
  { key: "margin", label: "Proposal & margin" },
] as const;

/**
 * Old tab keys that now live as a part of another tab
 * (docs/design/screen-map.md). `?tab=guests` opens Client & guests and
 * scrolls to the guest list.
 */
export const EVENT_TAB_PARTS: Readonly<
  Partial<Record<EventDetailTab, EventDetailTab>>
> = {
  guests: "client",
  layouts: "equipment",
  todos: "timeline",
  incidents: "photos",
  history: "photos",
};

/**
 * Workflow grouping for the event detail navigation. Tab keys (and the
 * `?tab=` URL contract) are unchanged; groups only decide which sections sit
 * together on screen.
 */
export const EVENT_TAB_GROUPS: readonly {
  key: "plan" | "food" | "dayof" | "records" | "money";
  label: string;
  tabs: readonly EventDetailTab[];
}[] = [
  { key: "plan", label: "Plan", tabs: ["overview", "chat", "client"] },
  { key: "food", label: "Food", tabs: ["menu", "prep", "inventory"] },
  {
    key: "dayof",
    label: "Day-of",
    tabs: ["timeline", "staffing", "equipment"],
  },
  { key: "records", label: "Photos & incidents", tabs: ["photos"] },
  { key: "money", label: "Money", tabs: ["margin"] },
] as const;

export function eventTabGroupFor(tab: EventDetailTab) {
  return (
    EVENT_TAB_GROUPS.find((group) => group.tabs.includes(tab)) ??
    EVENT_TAB_GROUPS[0]
  );
}

const EVENTS_INDEX_PATH = "/events";
const EVENTS_NEW_PATH = "/events/new";
const EVENTS_IMPORT_PATH = "/events/import";

/** Exact events list path — never a record id. */
export function eventsIndexPath(): string {
  return EVENTS_INDEX_PATH;
}

/** BEO / worksheet importer — paste text or drop TPP CSVs, review, create. */
export function eventImportPath(): string {
  return EVENTS_IMPORT_PATH;
}

const TAB_KEYS = new Set<string>([
  ...EVENT_DETAIL_TABS.map((tab) => tab.key),
  ...Object.keys(EVENT_TAB_PARTS),
]);

/** Builds /events/new?clientId=&proposalId= deep links from CRM (e.g. accepted Proposal). */
export class EventCreateLinkBuilder {
  build(prefill: EventCreatePrefill = {}): string {
    const params = new URLSearchParams();
    if (prefill.clientId) params.set("clientId", prefill.clientId);
    if (prefill.proposalId) params.set("proposalId", prefill.proposalId);
    const query = params.toString();
    return query ? `${EVENTS_NEW_PATH}?${query}` : EVENTS_NEW_PATH;
  }
}

export const eventCreateLinkBuilder = new EventCreateLinkBuilder();

export function eventDetailPath(id: string, tab?: EventDetailTab): string {
  if (!tab || tab === "overview") return `/events/${id}?tab=overview`;
  const host = EVENT_TAB_PARTS[tab];
  if (host) return `/events/${id}?tab=${host}#${tab}`;
  return `/events/${id}?tab=${tab}`;
}

/** Overview tab with the Event workbook review open on one packet section. */
export const WORKBOOK_REVIEW_PARAM = "workbook";
export function eventWorkbookReviewPath(id: string, section: string): string {
  return `${eventDetailPath(id, "overview")}&${WORKBOOK_REVIEW_PARAM}=${encodeURIComponent(section)}`;
}

export function parseEventDetailTab(
  value: string | null | undefined,
): EventDetailTab {
  if (value && TAB_KEYS.has(value)) {
    const tab = value as EventDetailTab;
    return EVENT_TAB_PARTS[tab] ?? tab;
  }
  return "overview";
}

export function eventCreatePath(prefill: EventCreatePrefill = {}): string {
  return eventCreateLinkBuilder.build(prefill);
}

/** Old Kitchen Event Menu destination → Event detail Menu tab. */
export function eventMenuRedirectPath(eventId: string): string {
  return eventDetailPath(eventId, "menu");
}
