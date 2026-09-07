/**
 * Event-day run-tracker write hooks — thin wrappers over the generated
 * EventTimelineActivity commands. Lives in src/lib like the briefing hooks
 * so feature roots stay free of direct convex/react imports.
 */
import {
  useCreateEventTimelineActivity,
  useEventTimelineActivityComplete,
  useEventTimelineActivityReopen,
} from "./manifest-convex-react";

/** One planned run-of-show block, ready to schedule. */
export type RunTaskPlan = {
  idempotencyKey: string;
  eventId: string;
  name: string;
  startsAt: number;
  category?: string;
  notes?: string;
  responsibleParty?: string;
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
 * Schedule a whole planned run of show in order. Deterministic
 * idempotency keys make a double tap a no-op instead of a duplicate
 * board.
 */
export function useCreateRunTasks() {
  const create = useCreateEventTimelineActivity();
  return async (plans: RunTaskPlan[]) => {
    for (const plan of plans) {
      await create({
        idempotencyKey: plan.idempotencyKey,
        eventId: plan.eventId,
        name: plan.name,
        startsAt: plan.startsAt,
        category: plan.category,
        notes: plan.notes,
        responsibleParty: plan.responsibleParty,
        sortOrder: plan.sortOrder,
      });
    }
  };
}
