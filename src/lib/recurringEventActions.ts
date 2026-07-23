import { useAction } from "convex/react";
import { api, type Id } from "./api";
import type {
  EventRecurrenceEndCondition,
  EventRecurrenceFrequency,
} from "./eventRecurrence";

export interface ConfigureRecurringEventInput {
  docId: Id<"events">;
  frequency: EventRecurrenceFrequency;
  endCondition: EventRecurrenceEndCondition;
  recurrenceEndsAt?: number;
  occurrenceLimit?: number;
  version?: number;
}

/**
 * Authored adapter for the scheduler-arming action. Event lifecycle changes
 * inside that action still flow through the generated Manifest mutation.
 */
export function useConfigureRecurringEvent() {
  return useAction(api.recurringEvents.configure);
}
