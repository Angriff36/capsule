/**
 * Event-day run-tracker write hooks — thin wrappers over the generated
 * EventTimelineActivity commands. Lives in src/lib like the briefing hooks
 * so feature roots stay free of direct convex/react imports.
 */
import {
  useEventTimelineActivityComplete,
  useEventTimelineActivityReopen,
} from "./manifest-convex-react";
import type { Id } from "./api";
import { useScheduleEventTimeline } from "./operational-transactions";

/** One planned run-of-show block, ready to schedule. */
export type RunTaskPlan = {
  idempotencyKey: string;
  eventId: string;
  name: string;
  startsAt?: number;
  endsAt?: number;
  category?: string;
  notes?: string;
  responsibleParty?: string;
  assigneeTeams?: string[];
  sortOrder?: number;
};

export function useCompleteRunTask() {
  const complete = useEventTimelineActivityComplete();
  return (args: {
    docId: string;
    version?: number;
    completedByPersonId?: string | null;
  }) =>
    complete({
      docId: args.docId,
      version: args.version,
      completedByPersonId: args.completedByPersonId ?? undefined,
    });
}

export function useReopenRunTask() {
  const reopen = useEventTimelineActivityReopen();
  return (args: { docId: string; version?: number }) =>
    reopen({ docId: args.docId, version: args.version });
}

/**
 * Schedule a selection atomically through the generated commands. Existing
 * matching blocks keep their times, assignments, notes and performed work.
 */
export function useCreateRunTasks() {
  const schedule = useScheduleEventTimeline();
  return async (plans: RunTaskPlan[], operationKey: string) => {
    if (plans.length === 0) return { created: 0, existing: 0 };
    return schedule({
      eventId: plans[0].eventId as Id<"events">,
      operationKey,
      plans: plans.map(
        ({ eventId: _eventId, sortOrder: _sortOrder, ...plan }) => plan,
      ),
    });
  };
}
