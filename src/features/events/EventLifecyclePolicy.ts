import type { EventStage } from "./eventStatus";
import {
  EventApproveLifecycle,
  EventBeginExecutionLifecycle,
  EventCancelLifecycle,
  EventCloseOutLifecycle,
  EventCompleteLifecycle,
  EventConfirmSalesLockLifecycle,
  EventFinalizeEventLifecycle,
  EventLockForSalesLifecycle,
  EventReturnToPlanningLifecycle,
  EventSubmitForApprovalLifecycle,
} from "../../generated/manifest-wiring-bindings";
import { classifyCommandFailure } from "./CommandFailure";

export type EventLifecycleActionKey =
  | "submitForApproval"
  | "returnToPlanning"
  | "approve"
  | "lockForSales"
  | "confirmSalesLock"
  | "finalizeEvent"
  | "beginExecution"
  | "complete"
  | "closeOut"
  | "cancel";

export interface EventLifecycleAction {
  key: EventLifecycleActionKey;
  label: string;
  kind: "primary" | "ghost" | "danger";
  needsReason?: boolean;
}

const ACTIONS: ReadonlyArray<
  EventLifecycleAction & {
    lifecycle: ReadonlyArray<{ property: string; from: string; to: string }>;
  }
> = [
  {
    key: "submitForApproval",
    label: "Submit for approval",
    kind: "primary",
    lifecycle: EventSubmitForApprovalLifecycle,
  },
  {
    key: "returnToPlanning",
    label: "Return to planning",
    kind: "ghost",
    needsReason: true,
    lifecycle: EventReturnToPlanningLifecycle,
  },
  {
    key: "approve",
    label: "Approve",
    kind: "primary",
    lifecycle: EventApproveLifecycle,
  },
  {
    key: "lockForSales",
    label: "Lock for sales",
    kind: "primary",
    lifecycle: EventLockForSalesLifecycle,
  },
  {
    // Both commands move sales_lock → executing. Sales uses confirmSalesLock
    // (salesAccess, EventSalesLockConfirmed); event staff uses beginExecution
    // (eventAccess, EventExecutionStarted). Neither freezes on unfinished
    // prep/pack/delivery — readiness is a projection, not a gate.
    key: "confirmSalesLock",
    label: "Confirm sales lock & start the event",
    kind: "primary",
    lifecycle: EventConfirmSalesLockLifecycle,
  },
  {
    key: "finalizeEvent",
    label: "Finalize event",
    kind: "primary",
    lifecycle: EventFinalizeEventLifecycle,
  },
  {
    key: "beginExecution",
    label: "Start the event",
    kind: "primary",
    lifecycle: EventBeginExecutionLifecycle,
  },
  {
    key: "complete",
    label: "Complete",
    kind: "primary",
    lifecycle: EventCompleteLifecycle,
  },
  {
    key: "closeOut",
    label: "Close out",
    kind: "primary",
    lifecycle: EventCloseOutLifecycle,
  },
  {
    key: "cancel",
    label: "Cancel event",
    kind: "danger",
    needsReason: true,
    lifecycle: EventCancelLifecycle,
  },
];

const PLANNING_REVISION_STAGES = new Set<string>(
  [
    ...EventSubmitForApprovalLifecycle,
    ...EventApproveLifecycle,
    ...EventLockForSalesLifecycle,
    ...EventBeginExecutionLifecycle,
  ].map((transition) => transition.from),
);
const HEADCOUNT_REVISION_STAGES = new Set<string>([
  ...PLANNING_REVISION_STAGES,
  ...EventCompleteLifecycle.map((transition) => transition.from),
]);

/** Event fields the submit and sales-lock guards read. */
export interface EventReadiness {
  plannedAt?: number | null;
  clientId?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
}

/** UI offer set derived from generated, proven Event stage transitions. */
export class EventLifecyclePolicy {
  availableActions(
    stage: string,
    planning?: EventReadiness,
  ): EventLifecycleAction[] {
    const blocked = planning
      ? this.blockedActions(stage, planning).map((item) => item.key)
      : [];
    return (
      ACTIONS.filter((action) =>
        action.lifecycle.some(
          (transition) =>
            transition.property === "stage" && transition.from === stage,
        ),
      )
        // Planning -> completed exists only for old-system events that are
        // already over (Event.recordPastCompletion, its own button); a planned
        // event is never finished from the stage buttons.
        .filter(
          (action) => !(action.key === "complete" && stage === "planning"),
        )
        .filter((action) => !blocked.includes(action.key))
        .map(({ lifecycle: _lifecycle, ...action }) => action)
    );
  }

  /**
   * Stage moves the lifecycle allows from `stage` that the Event command
   * guards would still reject, with the reason a person can fix.
   */
  blockedActions(
    stage: string,
    event: EventReadiness,
  ): { key: EventLifecycleActionKey; reason: string }[] {
    if (stage === "planning" && event.plannedAt == null) {
      return [
        {
          key: "submitForApproval",
          reason: "Use Complete planning below before you submit for approval.",
        },
      ];
    }
    if (stage === "approved") {
      const missing = [
        event.clientId == null ? "a client" : null,
        event.plannedAt == null ? "completed planning" : null,
        event.startsAt == null ? "a start time" : null,
        event.endsAt == null ? "an end time" : null,
        !(Number(event.expectedHeadcount ?? 0) > 0) ? "a headcount" : null,
      ].filter((item): item is string => item != null);
      if (missing.length) {
        return [
          {
            key: "lockForSales",
            reason: `Add ${missing.join(", ")} before the sales lock.`,
          },
        ];
      }
    }
    return [];
  }

  isEditableStage(stage: string): boolean {
    return PLANNING_REVISION_STAGES.has(stage);
  }

  canChangeHeadcount(stage: string): boolean {
    return HEADCOUNT_REVISION_STAGES.has(stage);
  }

  humanizeCommandError(message: string): string {
    return classifyCommandFailure(message).detail;
  }

  assertStage(stage: string): stage is EventStage {
    return (
      stage === "quote" ||
      stage === "planning" ||
      stage === "pending_approval" ||
      stage === "approved" ||
      stage === "sales_lock" ||
      stage === "executing" ||
      stage === "final" ||
      stage === "completed" ||
      stage === "cancelled" ||
      stage === "closed_out"
    );
  }
}

export const eventLifecyclePolicy = new EventLifecyclePolicy();
