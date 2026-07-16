import type { EventStage } from "./eventStatus";

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

/** UI offer set mirroring generated Event stage transitions (mutations enforce). */
export class EventLifecyclePolicy {
  availableActions(stage: string): EventLifecycleAction[] {
    const actions: EventLifecycleAction[] = [];
    if (stage === "planning") {
      actions.push({
        key: "submitForApproval",
        label: "Submit for approval",
        kind: "primary",
      });
    }
    if (stage === "pending_approval") {
      actions.push({ key: "approve", label: "Approve", kind: "primary" });
      actions.push({
        key: "returnToPlanning",
        label: "Return to planning",
        kind: "ghost",
        needsReason: true,
      });
    }
    if (stage === "approved") {
      actions.push({
        key: "beginExecution",
        label: "Begin execution",
        kind: "primary",
      });
      actions.push({
        key: "returnToPlanning",
        label: "Return to planning",
        kind: "ghost",
        needsReason: true,
      });
    }
    if (stage === "executing") {
      actions.push({ key: "complete", label: "Complete", kind: "primary" });
    }
    if (stage === "completed") {
      actions.push({ key: "closeOut", label: "Close out", kind: "primary" });
    }
    if (
      stage === "planning" ||
      stage === "pending_approval" ||
      stage === "approved" ||
      stage === "executing"
    ) {
      actions.push({
        key: "cancel",
        label: "Cancel event",
        kind: "danger",
        needsReason: true,
      });
    }
    return actions;
  }

  isEditableStage(stage: string): boolean {
    return (
      stage === "planning" ||
      stage === "pending_approval" ||
      stage === "approved" ||
      stage === "executing"
    );
  }

  humanizeCommandError(message: string): string {
    if (/Guard \d+ failed/.test(message)) {
      return "The event's current stage does not allow this action.";
    }
    if (/No tenant in authentication context/.test(message)) {
      return "Your account has no workspace assigned yet.";
    }
    if (/Headcount must be between/.test(message)) {
      return "Headcount must be between 1 and 100000.";
    }
    if (/Cancellation reason is required/.test(message)) {
      return "A cancellation reason is required.";
    }
    const policy =
      message.match(/Uncaught Error: (.+?)\b/) ??
      message.trim().match(/^(.+)$/);
    if (policy?.[1] && /may |permission|role/i.test(policy[1])) {
      return `Your role does not have permission for this (${policy[1]}).`;
    }
    return message;
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
