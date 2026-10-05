export type CommandFailureCategory =
  "denied" | "validation" | "guard_blocked" | "conflict" | "unexpected";

/**
 * Stable failure code (backend end-state spec BE-18.3). Read from the same
 * generated/authored error text the banner uses; it is not a second error
 * envelope. A refused other-company record and a missing one share
 * NOT_FOUND_OR_FORBIDDEN so the code never tells a caller which it was.
 */
export type CommandFailureCode =
  | "NOT_FOUND_OR_FORBIDDEN"
  | "STALE_VERSION"
  | "INVALID_STATE"
  | "VALIDATION_FAILED"
  | "MISSING_REQUIRED_FACT"
  | "UNIT_CONVERSION_UNRESOLVED"
  | "INSUFFICIENT_STOCK"
  | "SCHEDULE_CONFLICT"
  | "PROVIDER_RETRYING"
  | "PROVIDER_ACTION_REQUIRED"
  | "RECONCILIATION_REQUIRED"
  | "UNEXPECTED";

/** A corrective step the user can take directly from the failure banner. */
export interface CommandFailureAction {
  label: string;
  /** Reload the page — the correct fix for stale/conflict/removed-record failures. */
  reload?: boolean;
}

export interface CommandFailure {
  category: CommandFailureCategory;
  code: CommandFailureCode;
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
function stateTransitionFailure(
  detail: string,
): Omit<CommandFailure, "code"> | null {
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
    title: "Not ready for this yet",
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
  // [ \t]* not \s*: an empty server message must stay empty, not borrow the
  // first stack line below it.
  const uncaught = raw.match(
    /Uncaught (?:DOMException|OperationError|ConvexError|Error):[ \t]*([^\r\n]*)/i,
  )?.[1];
  const argumentValidation = raw.match(
    /ArgumentValidationError:\s*([^\r\n]+)/i,
  )?.[1];
  const schemaValidation = raw.match(
    /(?:DocumentDoesNotMatchSchema|does not match the schema):\s*([^\r\n]+)/i,
  )?.[1];
  const detail = (
    (uncaught?.trim() ? uncaught : undefined) ??
    argumentValidation ??
    schemaValidation ??
    (uncaught !== undefined ? "" : raw)
  )
    .replace(/^\[CONVEX [^\]]+\]\s*/, "")
    .replace(/\[Request ID:\s*[^\]]+\]\s*/gi, "")
    .replace(/^Server Error\s*/i, "")
    .replace(
      /^Uncaught (?:DOMException|OperationError|ConvexError|Error):\s*/i,
      "",
    )
    .replace(/^Error:\s*/i, "")
    .replace(/\s*Called by client\s*$/i, "")
    .trim();
  return { detail, operation, requestId };
}

function creationSubject(operation: string | undefined): string {
  const entity = operation?.match(/^([A-Za-z0-9]+)_createVia/)?.[1];
  return entity
    ? entity.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase()
    : "item";
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

const DENIED_TEXT =
  /staff may|permission|not allowed|policy|\bonly an? [^.]{0,60}\bmay\b|\bmay (see|update|change|create|add|remove|record|run|correct|reconcile|view|use|approve|manage)\b|sign in/i;

/** The spec code for a failure, read from its category and server text. */
function failureCode(
  category: CommandFailureCategory,
  detail: string,
): CommandFailureCode {
  if (/ConcurrencyConflict|VERSION_MISMATCH/i.test(detail))
    return "STALE_VERSION";
  if (
    category === "denied" ||
    /\bnot found\b|No tenant|authentication context|not authenticated/i.test(
      detail,
    ) ||
    DENIED_TEXT.test(detail)
  )
    return "NOT_FOUND_OR_FORBIDDEN";
  if (
    /not enough (free )?stock|short (by|of) \d|only \d+ (left|free)/i.test(
      detail,
    )
  )
    return "INSUFFICIENT_STOCK";
  if (
    /already out for|is already (out|on|working|booked|assigned)\b|in the shop|out of service|on leave|same time|overlap/i.test(
      detail,
    )
  )
    return "SCHEDULE_CONFLICT";
  if (
    /doesn't convert|does not convert|no conversion|unit (differs|mapping)|unit from the container/i.test(
      detail,
    )
  )
    return "UNIT_CONVERSION_UNRESOLVED";
  if (/rate limit|retry after|will try again|trying again/i.test(detail))
    return "PROVIDER_RETRYING";
  if (
    /reconnect|is missing on this deployment|provider (turned|did not|rejected|declined)|signing secret/i.test(
      detail,
    )
  )
    return "PROVIDER_ACTION_REQUIRED";
  if (
    /^reconcile\b|\breconcile [^.]{0,60}\bbefore\b|until reviewed|review (it|this|them) first|sort (those|that|it|them) out first/i.test(
      detail,
    )
  )
    return "RECONCILIATION_REQUIRED";
  if (category === "guard_blocked") return "INVALID_STATE";
  if (
    /\bis missing\b|\bmissing\b|\bfirst\.?$|\bneeds? (a|an|the|its) /i.test(
      detail,
    )
  )
    return "MISSING_REQUIRED_FACT";
  if (
    category === "validation" ||
    /Validator error|ArgumentValidationError/i.test(detail)
  )
    return "VALIDATION_FAILED";
  return "UNEXPECTED";
}

function rootCause(error: unknown): unknown {
  return typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "BulkRunFailure" &&
    "cause" in error
    ? rootCause(error.cause)
    : error;
}

export function classifyCommandFailure(error: unknown): CommandFailure {
  const failure = classifyWithoutCode(error);
  const cause = rootCause(error);
  const detail = isZodError(cause) ? "" : normalizeCommandError(cause).detail;
  return { ...failure, code: failureCode(failure.category, detail) };
}

function classifyWithoutCode(error: unknown): Omit<CommandFailure, "code"> {
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
      detail: `${classified.detail} (${bulk.completed} saved, ${bulk.failed} didn't go through, ${bulk.remaining} still waiting.)`,
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
      title: "Someone else changed this",
      detail:
        "Someone else saved a change while you were working. Refresh to see the latest, then try again — what you typed is still here.",
      action: REFRESH_ACTION,
    };
  }
  const transition = stateTransitionFailure(detail);
  if (transition) return transition;
  if (/\bnot found\b/i.test(detail)) {
    return {
      category: "conflict",
      title: "This isn't available anymore",
      detail:
        "It may have been removed, or it isn't part of your workspace. Refresh to see the current list.",
      action: REFRESH_ACTION,
    };
  }
  if (/No tenant|authentication context|not authenticated/i.test(detail)) {
    return {
      category: "denied",
      title: "Sign in again",
      detail:
        "We couldn't tell which workspace you're in. Sign out, sign back in, then try again.",
    };
  }
  if (
    /Decryption failed|Unsupported Manifest encryption|CONVEX_FIELD_ENCRYPTION_KEY/i.test(
      detail,
    )
  ) {
    return {
      category: "unexpected",
      title: "Contact details couldn't be read",
      detail: requestId
        ? `Contact and address details could not be read (ask the office with this code: ${requestId}). Refresh once. If it happens again, ask the office to check Capsule's secure storage.`
        : "Contact and address details could not be read. Refresh once. If it happens again, ask the office to check Capsule's secure storage.",
      action: REFRESH_ACTION,
    };
  }
  if (/staff may|permission|not allowed|policy/i.test(detail)) {
    return {
      category: "denied",
      title: "You can't do this",
      detail:
        "Your account does not have access. Ask someone who can, or switch to an account that can.",
    };
  }
  if (/Guard \d+ failed/i.test(detail) && /_createVia/.test(operation ?? "")) {
    const subject = creationSubject(operation);
    return {
      category: "guard_blocked",
      title: `${subject[0]?.toUpperCase() ?? "R"}${subject.slice(1)} wasn't created`,
      detail: `Something about this new ${subject}, or what it belongs to, isn't allowed right now. Nothing was saved. Check the details, then try again.`,
    };
  }
  if (/Guard \d+ failed|Invalid state transition/i.test(detail)) {
    return {
      category: "guard_blocked",
      title: "Not allowed right now",
      detail:
        "That change isn't allowed for this one right now. Nothing was saved. Check its details, then try again.",
    };
  }
  if (/rate limit|retry after \d/i.test(detail)) {
    return {
      category: "unexpected",
      title: "Too many at once",
      detail:
        "That was a lot of changes at once. Nothing is lost. Wait a few seconds, then try again.",
    };
  }
  if (
    /Validator error|ArgumentValidation|does not match the schema|Invalid argument/i.test(
      detail,
    )
  ) {
    return {
      category: "validation",
      title: "Check the entered details",
      detail:
        "One of the values isn't the right kind (for example a date where a number goes). Check what you entered, then try again.",
    };
  }
  if (DENIED_TEXT.test(detail)) {
    return {
      category: "denied",
      title: "You can't do this",
      detail: `${sentence(detail)} Ask someone who can to make this change.`,
    };
  }
  if (
    /required|must be|cannot be|between|after its start|two characters|Invalid argument|ArgumentValidation|does not match the schema|before parsing|Reading the selected file|Select a |Pick a |Give this |Headcount|Budget and quoted/i.test(
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
        ? `Something went wrong on our side and nothing was saved. It is safe to refresh and try again. If it keeps happening, tell the office this code: ${requestId}.`
        : "Something went wrong on our side and nothing was saved. It is safe to refresh and try again.",
      action: REFRESH_ACTION,
    };
  }
  // A plain sentence written for people by the server: show it as it is,
  // with the next step when the sentence does not already give one.
  const text = sentence(detail);
  const hasNextStep =
    /\b(try again|use |add |give |pick |choose |lower |raise |turn |ask |sort |fill |set |change |remove |move |enter )/i.test(
      text,
    );
  const nextStep = hasNextStep
    ? ""
    : /\bmissing\b|\bneeds?\b/i.test(text)
      ? " Fill that in, then try again."
      : " Nothing was saved. Fix that, then try again.";
  return {
    category: "unexpected",
    title: "Couldn't save this",
    detail: `${text}${nextStep}`,
  };
}

/** End a server sentence with a full stop. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}
