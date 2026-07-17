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

interface NormalizedCommandError {
  detail: string;
  operation?: string;
  requestId?: string;
}

function normalizeCommandError(error: unknown): NormalizedCommandError {
  const raw = messageOf(error).trim();
  const operation = raw.match(/mutations:([A-Za-z0-9_]+)/)?.[1];
  const requestId = raw.match(/\[Request ID:\s*([^\]]+)\]/i)?.[1];
  const uncaught = raw.match(/Uncaught Error:\s*([^\r\n]+)/i)?.[1];
  const detail = (uncaught ?? raw)
    .replace(/^\[CONVEX [^\]]+\]\s*/, "")
    .replace(/^Server Error\s*/i, "")
    .replace(/^Uncaught Error:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/\s+Called by client\s*$/i, "")
    .trim();
  return { detail, operation, requestId };
}

function creationSubject(operation: string | undefined): string {
  const entity = operation?.match(/^([A-Za-z0-9]+)_createVia/)?.[1];
  return entity
    ? entity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
    : "record";
}

export function classifyCommandFailure(error: unknown): CommandFailure {
  const normalized = normalizeCommandError(error);
  const { detail, operation, requestId } = normalized;
  if (/ConcurrencyConflict|VERSION_MISMATCH/i.test(detail)) {
    return {
      category: "conflict",
      title: "This record changed elsewhere",
      detail:
        "Refresh the page and try the action again. Your entered details are still valid.",
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
  if (/Guard \d+ failed/i.test(detail) && /_createVia/.test(operation ?? "")) {
    const subject = creationSubject(operation);
    return {
      category: "guard_blocked",
      title: `${subject[0]?.toUpperCase() ?? "R"}${subject.slice(1)} wasn't created`,
      detail: `The ${subject} could not be created because one of its requirements was not met. Nothing was saved.${requestId ? ` Request ID: ${requestId}.` : ""}`,
    };
  }
  if (/Guard \d+ failed|Invalid state transition/i.test(detail)) {
    return {
      category: "guard_blocked",
      title: "Action could not be completed",
      detail: `One of this action's requirements was not met. No changes were saved.${requestId ? ` Request ID: ${requestId}.` : ""}`,
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
