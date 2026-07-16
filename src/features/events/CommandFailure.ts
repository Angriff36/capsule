export type CommandFailureCategory =
  "denied" | "validation" | "guard_blocked" | "conflict" | "unexpected";

export interface CommandFailure {
  category: CommandFailureCategory;
  title: string;
  detail: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function classifyCommandFailure(error: unknown): CommandFailure {
  const raw = messageOf(error)
    .replace(/^\[CONVEX [^\]]+\]\s*/, "")
    .trim();
  const detail = raw.replace(/^Uncaught Error:\s*/, "");
  if (/ConcurrencyConflict|VERSION_MISMATCH/i.test(detail)) {
    return {
      category: "conflict",
      title: "This event changed elsewhere",
      detail: "Refresh the event and try the action again.",
    };
  }
  if (/No tenant|authentication context|not authenticated/i.test(detail)) {
    return {
      category: "denied",
      title: "Workspace access required",
      detail:
        "Your session does not include the workspace access this action requires.",
    };
  }
  if (/staff may|permission|not allowed|policy/i.test(detail)) {
    return { category: "denied", title: "Action denied", detail };
  }
  if (/Guard \d+ failed|Invalid state transition/i.test(detail)) {
    return {
      category: "guard_blocked",
      title: "Action blocked",
      detail:
        "The record's current lifecycle stage or capability state does not allow this action.",
    };
  }
  if (
    /required|must be|cannot be|between|after its start|two characters|Invalid argument/i.test(
      detail,
    )
  ) {
    return {
      category: "validation",
      title: "Check the entered details",
      detail,
    };
  }
  return {
    category: "unexpected",
    title: "Action failed unexpectedly",
    detail: detail || "The server did not return an error description.",
  };
}
