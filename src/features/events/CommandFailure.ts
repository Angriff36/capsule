export type CommandFailureCategory =
  "denied" | "validation" | "guard_blocked" | "conflict" | "unexpected";

/** A corrective step the user can take directly from the failure banner. */
export interface CommandFailureAction {
  label: string;
  /** Reload the page — the correct fix for stale/conflict/removed-record failures. */
  reload?: boolean;
}

export interface CommandFailure {
  category: CommandFailureCategory;
  title: string;
  detail: string;
  action?: CommandFailureAction;
}

const REFRESH_ACTION: CommandFailureAction = {
  label: "Refresh & retry",
  reload: true,
};

/** Turn a snake_case stage/state token into readable words ("pending_approval" -> "pending approval"). */
function humanizeState(token: string): string {
  return token.replace(/_/g, " ").trim();
}

/**
 * Parse the generated "Invalid state transition" guard message into plain language.
 * Raw shape: Invalid state transition for 'stage': 'A' -> 'B' is not
 * allowed. Allowed from 'A': ['B', 'C']  (placeholder tokens - the real
 * stage names come from the generated guard message at runtime)
 */
function stateTransitionFailure(detail: string): CommandFailure | null {
  const match = detail.match(
    /Invalid state transition for '[^']+':\s*'([^']+)'\s*->\s*'([^']+)'[^.]*\.\s*Allowed from '[^']+':\s*\[([^\]]*)\]/i,
  );
  if (!match) return null;
  const [, from, to] = match;
  const allowed = (match[3] ?? "")
    .split(",")
    .map((s) => s.replace(/['"\s]/g, ""))
    .filter(Boolean)
    .map(humanizeState);
  const nextSteps =
    allowed.length > 0
      ? `From here you can move it to: ${allowed.join(", ")}.`
      : `It's already ${humanizeState(from)} and can't change from here.`;
  return {
    category: "guard_blocked",
    title: "Not ready for this step yet",
    detail: `This can't move to "${humanizeState(to)}" while it's "${humanizeState(
      from,
    )}". ${nextSteps}`,
  };
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const data =
      "data" in error && error.data != null
        ? typeof error.data === "string"
          ? error.data
          : JSON.stringify(error.data)
        : "";
    return data ? `${error.message}\n${data}` : error.message;
  }
  return String(error);
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
  // WebCrypto failures arrive as OperationError, not Error — must not drop them.
  const uncaught = raw.match(
    /Uncaught (?:DOMException|OperationError|Error):\s*([^\r\n]+)/i,
  )?.[1];
  const argumentValidation = raw.match(
    /ArgumentValidationError:\s*([^\r\n]+)/i,
  )?.[1];
  const schemaValidation = raw.match(
    /(?:DocumentDoesNotMatchSchema|does not match the schema):\s*([^\r\n]+)/i,
  )?.[1];
  const detail = (uncaught ?? argumentValidation ?? schemaValidation ?? raw)
    .replace(/^\[CONVEX [^\]]+\]\s*/, "")
    .replace(/\[Request ID:\s*[^\]]+\]\s*/gi, "")
    .replace(/^Server Error\s*/i, "")
    .replace(/^Uncaught (?:DOMException|OperationError|Error):\s*/i, "")
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

function isZodError(
  error: unknown,
): error is { name: string; issues?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: string }).name === "ZodError"
  );
}

export function classifyCommandFailure(error: unknown): CommandFailure {
  const bulk =
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "BulkRunFailure" &&
    "cause" in error &&
    "completed" in error &&
    "failed" in error &&
    "remaining" in error
      ? (error as {
          cause: unknown;
          completed: number;
          failed: number;
          remaining: number;
        })
      : null;
  if (bulk) {
    const classified = classifyCommandFailure(bulk.cause);
    return {
      ...classified,
      detail: `${classified.detail} (${bulk.completed} completed, ${bulk.failed} failed, ${bulk.remaining} remaining.)`,
    };
  }
  const normalized = normalizeCommandError(error);
  const { detail, operation, requestId } = normalized;
  if (isZodError(error)) {
    return {
      category: "validation",
      title: "Check the entered details",
      detail:
        "One or more fields are missing or invalid. Double-check what you entered, then try again.",
    };
  }
  if (/ConcurrencyConflict|VERSION_MISMATCH/i.test(detail)) {
    return {
      category: "conflict",
      title: "This record changed elsewhere",
      detail:
        "Someone else updated this record while you were working. Refresh to load the latest, then try again — your entered details are still valid.",
      action: REFRESH_ACTION,
    };
  }
  const transition = stateTransitionFailure(detail);
  if (transition) return transition;
  if (/\bnot found\b/i.test(detail)) {
    return {
      category: "conflict",
      title: "This record isn't available",
      detail:
        "It may have been removed, or it isn't part of your workspace. Refresh to see the current list.",
      action: REFRESH_ACTION,
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
  if (
    /Decryption failed|Unsupported Manifest encryption|CONVEX_FIELD_ENCRYPTION_KEY/i.test(
      detail,
    )
  ) {
    return {
      category: "unexpected",
      title: "Secure field storage failed",
      detail: requestId
        ? `Contact/address encryption could not run (Request ID: ${requestId}). Refresh once. If it persists, the workspace encryption key drifted — do not rewrite CONVEX_FIELD_ENCRYPTION_KEY without migrating data.`
        : "Contact/address encryption could not run. Refresh once. If it persists, the workspace encryption key may have drifted.",
      action: REFRESH_ACTION,
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
    /required|must be|cannot be|between|after its start|two characters|Invalid argument|ArgumentValidation|does not match the schema|before parsing|Reading the selected file|Select a |Headcount|Budget and quoted/i.test(
      detail,
    )
  ) {
    return {
      category: "validation",
      title: "Check the entered details",
      detail,
    };
  }
  if (!detail || /^server error$/i.test(detail)) {
    return {
      category: "unexpected",
      title: "Action failed unexpectedly",
      detail: requestId
        ? `The server rejected this action without a usable reason (Request ID: ${requestId}). Confirm you are signed into a workspace, refresh, and retry. If it keeps failing, share that request ID.`
        : "The server rejected this action without a usable reason. Refresh and retry.",
      action: REFRESH_ACTION,
    };
  }
  return {
    category: "unexpected",
    title: "Action failed unexpectedly",
    detail: requestId ? `${detail} (Request ID: ${requestId})` : detail,
  };
}
