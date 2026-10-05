// AUTHOR-OWNED — one meaning of "where is this outside delivery" for every
// outbound channel (webhooks, sign-in emails, text alerts, calendar, push).
// Each channel keeps its own ledger rows; this file turns those rows into one
// state, a bounded retry plan with growing waits, and a safe error class that
// never echoes a provider message (which can carry tokens or addresses).

export type DeliveryState =
  | "pending"
  | "processing"
  | "delivered"
  | "retryable_failed"
  | "terminal_failed"
  | "uncertain";

export type DeliveryErrorClass =
  | "timeout"
  | "throttled"
  | "not_authorized"
  | "not_found"
  | "rejected"
  | "provider_down"
  | "network"
  | "not_set_up"
  | "unknown";

export interface DeliveryAttemptRow {
  /** started = a send began (claim); retry_requested = a person asked again. */
  outcome: "started" | "succeeded" | "failed" | "retry_requested";
  at: number;
  httpStatus?: number | null;
  providerId?: string | null;
  errorClass?: DeliveryErrorClass | null;
}

export interface DeliverySummary {
  state: DeliveryState;
  /** Tries since the last "try again" from a person. */
  attemptCount: number;
  nextRetryAt: number | null;
  providerId: string | null;
  errorClass: DeliveryErrorClass | null;
  lastHttpStatus: number | null;
  lastAttemptAt: number | null;
}

export interface DeliveryPolicy {
  maxAttempts: number;
  /** First wait after a failure; each later wait doubles. */
  baseDelayMs: number;
  maxDelayMs: number;
  /** A started send with no result after this long is "uncertain". */
  leaseMs: number;
}

export const DEFAULT_DELIVERY_POLICY: DeliveryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 60_000,
  maxDelayMs: 60 * 60_000,
  leaseMs: 5 * 60_000,
};

export function retryDelayMs(
  attemptCount: number,
  policy: DeliveryPolicy = DEFAULT_DELIVERY_POLICY,
): number {
  const exponent = Math.max(0, attemptCount - 1);
  return Math.min(policy.maxDelayMs, policy.baseDelayMs * 2 ** exponent);
}

/** Errors that will not fix themselves: retrying only repeats them. */
const PERMANENT: ReadonlySet<DeliveryErrorClass> = new Set([
  "not_authorized",
  "not_found",
  "rejected",
  "not_set_up",
]);

export function isPermanentError(errorClass: DeliveryErrorClass): boolean {
  return PERMANENT.has(errorClass);
}

export function classifyDeliveryError(input: {
  httpStatus?: number | null;
  timedOut?: boolean;
  networkFailure?: boolean;
}): DeliveryErrorClass {
  if (input.timedOut) return "timeout";
  const status = input.httpStatus;
  if (status == null) return input.networkFailure ? "network" : "unknown";
  if (status === 408) return "timeout";
  if (status === 429) return "throttled";
  if (status === 401 || status === 403) return "not_authorized";
  if (status === 404 || status === 410) return "not_found";
  if (status >= 400 && status < 500) return "rejected";
  if (status >= 500) return "provider_down";
  return "unknown";
}

const ERROR_LABELS: Record<DeliveryErrorClass, string> = {
  timeout: "The other system did not answer in time.",
  throttled: "The other system asked us to slow down.",
  not_authorized: "The other system refused our sign-in.",
  not_found: "The address was not found.",
  rejected: "The other system refused the message.",
  provider_down: "The other system had a problem.",
  network: "Capsule could not reach the other system.",
  not_set_up: "This kind of message is not set up yet.",
  unknown: "The send did not finish.",
};

export function deliveryErrorLabel(errorClass: DeliveryErrorClass): string {
  return ERROR_LABELS[errorClass];
}

/**
 * One delivery's state from its ledger rows (any order). A success is final:
 * nothing is sent again. A person's "try again" starts a fresh attempt budget.
 */
export function summarizeDelivery(
  rows: readonly DeliveryAttemptRow[],
  now: number,
  policy: DeliveryPolicy = DEFAULT_DELIVERY_POLICY,
): DeliverySummary {
  const sorted = [...rows].sort((left, right) => left.at - right.at);
  const success = sorted.find((row) => row.outcome === "succeeded");
  const lastAttempt = [...sorted]
    .reverse()
    .find((row) => row.outcome === "failed" || row.outcome === "succeeded");
  const base = {
    providerId:
      success?.providerId ??
      [...sorted].reverse().find((row) => row.providerId)?.providerId ??
      null,
    lastHttpStatus: lastAttempt?.httpStatus ?? null,
    lastAttemptAt: lastAttempt?.at ?? null,
  };
  if (success) {
    return {
      ...base,
      state: "delivered",
      attemptCount: sorted.filter(
        (row) => row.outcome === "failed" || row.outcome === "succeeded",
      ).length,
      nextRetryAt: null,
      errorClass: null,
    };
  }

  let resetIndex = -1;
  sorted.forEach((row, index) => {
    if (row.outcome === "retry_requested") resetIndex = index;
  });
  const current = sorted.slice(resetIndex + 1);
  const failures = current.filter((row) => row.outcome === "failed");
  // A started send with no result after it is a lost try: it counts, so a
  // crash after the provider took it never hands out a fresh budget.
  const lostStarts = current.filter(
    (row, index) =>
      row.outcome === "started" && current[index + 1]?.outcome !== "failed",
  ).length;
  const tries = failures.length + lostStarts;
  const last = current.at(-1);

  if (!last) {
    return {
      ...base,
      state: "pending",
      attemptCount: 0,
      nextRetryAt: null,
      errorClass: null,
    };
  }
  if (last.outcome === "started") {
    const expired = now - last.at >= policy.leaseMs;
    return {
      ...base,
      state: expired ? "uncertain" : "processing",
      attemptCount: tries,
      nextRetryAt: null,
      errorClass: failures.at(-1)?.errorClass ?? null,
    };
  }
  const lastFailure = failures.at(-1)!;
  const errorClass = lastFailure.errorClass ?? "unknown";
  if (tries >= policy.maxAttempts || isPermanentError(errorClass)) {
    return {
      ...base,
      state: "terminal_failed",
      attemptCount: tries,
      nextRetryAt: null,
      errorClass,
    };
  }
  return {
    ...base,
    state: "retryable_failed",
    attemptCount: tries,
    nextRetryAt: lastFailure.at + retryDelayMs(tries, policy),
    errorClass,
  };
}

/** Whether a sender may try this delivery now. */
export function isDue(summary: DeliverySummary, now: number): boolean {
  if (summary.state === "pending") return true;
  if (summary.state === "retryable_failed") {
    return summary.nextRetryAt == null || now >= summary.nextRetryAt;
  }
  return false;
}
