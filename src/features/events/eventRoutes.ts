export type EventCreatePrefill = {
  clientId?: string;
};

const EVENTS_NEW_PATH = "/events/new";

/** Builds /events/new?clientId= deep links from CRM (e.g. accepted Proposal). */
export class EventCreateLinkBuilder {
  build(prefill: EventCreatePrefill = {}): string {
    if (!prefill.clientId) return EVENTS_NEW_PATH;
    const params = new URLSearchParams();
    params.set("clientId", prefill.clientId);
    return `${EVENTS_NEW_PATH}?${params.toString()}`;
  }
}

export const eventCreateLinkBuilder = new EventCreateLinkBuilder();

export function eventDetailPath(id: string): string {
  return `/events/${id}`;
}

export function eventCreatePath(prefill: EventCreatePrefill = {}): string {
  return eventCreateLinkBuilder.build(prefill);
}
