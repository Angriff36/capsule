import type { EventStage } from "./eventStatus";
import {
  EventApproveLifecycle,
  EventBeginExecutionLifecycle,
  EventCancelLifecycle,
  EventCloseOutLifecycle,
  EventCompleteLifecycle,
  EventReturnToPlanningLifecycle,
  EventSubmitForApprovalLifecycle,
} from "../../generated/manifest-wiring-bindings";
import { classifyCommandFailure } from "./CommandFailure";

export type EventLifecycleActionKey =
  | "submitForApproval"
  | "returnToPlanning"
  | "approve"
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
      stage === "planning" ||
      stage === "pending_approval" ||
      stage === "approved" ||
      stage === "executing" ||
      stage === "completed" ||
      stage === "cancelled" ||
      stage === "closed_out"
    );
  }
}

export const eventLifecyclePolicy = new EventLifecyclePolicy();
