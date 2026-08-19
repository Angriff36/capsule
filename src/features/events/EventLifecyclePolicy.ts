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
    // The domain command moves sales_lock → executing (a sales-side "go"
    // without beginExecution's ops-readiness guards), so the label says so
    // instead of implying the event merely stays locked.
    key: "confirmSalesLock",
    label: "Confirm sales lock & start execution",
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
    label: "Begin execution",
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

/** UI offer set derived from generated, proven Event stage transitions. */
export class EventLifecyclePolicy {
  availableActions(stage: string): EventLifecycleAction[] {
    return ACTIONS.filter((action) =>
      action.lifecycle.some(
        (transition) =>
          transition.property === "stage" && transition.from === stage,
      ),
    ).map(({ lifecycle: _lifecycle, ...action }) => action);
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
