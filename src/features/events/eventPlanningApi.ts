import { useAction } from "convex/react";
import type {
  ClientRegisterClientInput,
  EventGuestInviteClientInput,
  EventPlanEngagementClientInput,
  VenueRegisterClientInput,
} from "../../generated/manifest-wiring-bindings";
import { api, type Id } from "../../lib/api";

type Created<Table extends "clients" | "venues" | "events" | "eventGuests"> = {
  docId: Id<Table>;
};

export type EventPlanningInput = Omit<
  EventPlanEngagementClientInput,
  "startsAt" | "endsAt"
> & {
  startsAt: number;
  endsAt: number;
};

export function useCreateClient() {
  const run = useAction(api.lib.eventPlanning.createClient);
  return (input: ClientRegisterClientInput) =>
    run({ input }) as Promise<Created<"clients">>;
}

export function useCreateVenue() {
  const run = useAction(api.lib.eventPlanning.createVenue);
  return (input: VenueRegisterClientInput) =>
    run({ input }) as Promise<Created<"venues">>;
}

export function useCreateEvent() {
  const run = useAction(api.lib.eventPlanning.createEvent);
  return (input: EventPlanningInput) =>
    run({ input }) as Promise<Created<"events">>;
}

export function useCreateEventGuest() {
  const run = useAction(api.lib.eventPlanning.createEventGuest);
  return (input: EventGuestInviteClientInput) =>
    run({ input }) as Promise<Created<"eventGuests">>;
}
