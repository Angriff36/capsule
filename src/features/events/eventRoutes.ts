export type EventCreatePrefill = {
  clientId?: string;
  /** Accepted proposal to book: pre-fills the form and links + copies its menu on create. */
  proposalId?: string;
};

export type EventDetailTab =
  | "overview"
  | "menu"
  | "equipment"
  | "client"
  | "guests"
  | "photos"
  | "timeline"
  | "layouts"
  | "recurring"
  | "staffing"
  | "inventory"
  | "incidents"
  | "margin";

export const EVENT_DETAIL_TABS: readonly {
  key: EventDetailTab;
  label: string;
}[] = [
  { key: "overview", label: "Overview" },
  { key: "menu", label: "Menu" },
  { key: "equipment", label: "Equipment" },
  { key: "client", label: "Client Information" },
  { key: "guests", label: "Guests" },
  { key: "photos", label: "Event Photo Gallery" },
  { key: "timeline", label: "Timeline" },
  { key: "layouts", label: "Layouts" },
  { key: "recurring", label: "Recurring Schedule" },
  { key: "staffing", label: "Staffing" },
  { key: "inventory", label: "Inventory" },
  { key: "incidents", label: "Incidents" },
  { key: "margin", label: "Margin" },
] as const;

const EVENTS_INDEX_PATH = "/events";
const EVENTS_NEW_PATH = "/events/new";

/** Exact events list path — never a record id. */
export function eventsIndexPath(): string {
  return EVENTS_INDEX_PATH;
}

const TAB_KEYS = new Set<string>(EVENT_DETAIL_TABS.map((tab) => tab.key));

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
  return `/events/${id}?tab=${tab}`;
}

export function parseEventDetailTab(
  value: string | null | undefined,
): EventDetailTab {
  if (value && TAB_KEYS.has(value)) return value as EventDetailTab;
  return "overview";
}

export function eventCreatePath(prefill: EventCreatePrefill = {}): string {
  return eventCreateLinkBuilder.build(prefill);
}

/** Old Kitchen Event Menu destination → Event detail Menu tab. */
export function eventMenuRedirectPath(eventId: string): string {
  return eventDetailPath(eventId, "menu");
}
