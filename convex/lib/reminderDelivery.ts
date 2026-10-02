// AUTHOR-OWNED — what a payment-reminder send record holds and how a failed
// send is explained to staff (PL-OUTBOUND: AC-107, AC-109, AC-352).
//
// A send record names who it went to (where the address came from and a
// masked address, never the plain address: contact emails are kept
// encrypted), the sender, the template and its version, the attachment, a
// fingerprint of the exact email and PDF, the try number and the email
// service's id. "Accepted" means the email service took the email; Capsule
// does not hear back about delivery or bounces yet.

export type RecipientSource =
  | "billing contact"
  | "main contact"
  | "contact"
  | "client account";

export type ReminderFailureKind =
  | "not_set_up"
  | "no_recipient"
  | "payment_account"
  | "refused"
  | "service_down"
  | "unknown";

const REMEDY: Record<ReminderFailureKind, string> = {
  not_set_up:
    "Email sending is not set up for this workspace yet. Whoever runs Capsule needs to add the email service details.",
  no_recipient:
    "Add an email to the client account or an active billing contact, then send again.",
  payment_account:
    "Connect the company's Stripe account (Admin, then Integrations), then send again.",
  refused:
    "The email service would not take this email. Check the client's email address, then send again.",
  service_down:
    "The email service did not answer. Send again in a few minutes.",
  unknown:
    "Something went wrong sending this email. Send again; if it fails again, tell whoever runs Capsule.",
};

/** A send failure whose cause Capsule knows. */
export class ReminderDeliveryError extends Error {
  /** Key of the address the email service refused (see recipientKey). */
  recipientKey?: string;

  constructor(
    readonly kind: ReminderFailureKind,
    message: string,
  ) {
    super(message);
    this.name = "ReminderDeliveryError";
  }
}

/** Email service answer -> failure kind. 429 and 5xx are worth another try. */
export function emailServiceFailureKind(status: number): ReminderFailureKind {
  return status === 429 || status >= 500 ? "service_down" : "refused";
}

export function classifyReminderFailure(cause: unknown): {
  kind: ReminderFailureKind;
  remedy: string;
} {
  let kind: ReminderFailureKind = "unknown";
  if (cause instanceof ReminderDeliveryError) {
    kind = cause.kind;
  } else {
    const message =
      cause instanceof Error
        ? `${cause.message} ${String((cause as { data?: unknown }).data ?? "")}`
        : String(cause);
    if (/Email sending is not set up|CAPSULE_PUBLIC_APP_URL/u.test(message)) {
      kind = "not_set_up";
    } else if (/Stripe account/u.test(message)) {
      kind = "payment_account";
    } else if (/fetch failed|network|timed? ?out/iu.test(message)) {
      kind = "service_down";
    }
  }
  return { kind, remedy: REMEDY[kind] };
}

export function reminderRemedy(kind: ReminderFailureKind): string {
  return REMEDY[kind];
}

/** "billing@garden.example" -> "b•••@garden.example". */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${email[0]}•••${email.slice(at)}`;
}

/** Hex SHA-256 of the exact parts sent, in order. */
export async function artifactFingerprint(
  parts: Array<string | Uint8Array>,
): Promise<string> {
  const encoder = new TextEncoder();
  const chunks = parts.map((part) =>
    typeof part === "string" ? encoder.encode(part) : part,
  );
  const total = chunks.reduce((sum, chunk) => sum + chunk.length + 1, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length + 1; // a zero byte between parts
  }
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface LedgerRow {
  type: string;
  createdAt: number;
  payload: Record<string, unknown>;
}

/** A reminder counts as already sent when one went within this window. */
export const RECENT_SEND_WINDOW_MS = 24 * 60 * 60_000;

/**
 * The reminder the email service took in the last day for the same balance,
 * if any. A "send now" press after it would send the client the same email
 * twice.
 */
export function recentSameBalanceSend(
  ledger: LedgerRow[],
  deliveredType: string,
  amountDue: number,
  now: number,
): LedgerRow | null {
  return (
    ledger
      .filter(
        (row) =>
          row.type === deliveredType &&
          now - row.createdAt < RECENT_SEND_WINDOW_MS &&
          Number(row.payload.amountDue) === amountDue,
      )
      .sort((left, right) => right.createdAt - left.createdAt)[0] ?? null
  );
}

export interface ReminderHistoryItem {
  at: number;
  outcome: "accepted" | "skipped" | "failed";
  source: "scheduled" | "manual";
  attempt: number | null;
  to: string | null;
  words: string;
  remedy: string | null;
  willRetry: boolean;
}

const SKIP_WORDS: Record<string, string> = {
  schedule_replaced: "Skipped: the reminder dates were changed.",
  schedule_changed: "Skipped: the due date or reminder dates changed.",
  invoice_not_payable: "Skipped: the invoice no longer needs payment.",
  invoice_missing: "Skipped: the invoice was removed.",
  due_date_removed: "Skipped: the invoice has no due date.",
  stripe_payment_received: "Skipped: Stripe shows this invoice paid.",
  client_no_reminders: "Skipped: the client asked for no reminder emails.",
  client_no_email: "Skipped: the client asked for no emails from us.",
  address_refused:
    "Skipped: the email service refused this address before. Fix the client's email address and later reminders go again.",
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Newest first; what staff see under the invoice's reminders. */
export function reminderHistory(
  ledger: LedgerRow[],
  types: {
    delivered: string;
    suppressed: string;
    failed: string;
    /** The first email with the invoice ("Email the invoice"). */
    invoiceSent?: string;
    invoiceFailed?: string;
  },
): ReminderHistoryItem[] {
  const items: ReminderHistoryItem[] = [];
  for (const row of ledger) {
    const payload = row.payload;
    const source = payload.source === "manual" ? "manual" : "scheduled";
    const attempt =
      typeof payload.attempt === "number" ? payload.attempt + 1 : null;
    const to = text(payload.recipientMasked);
    if (types.invoiceSent && row.type === types.invoiceSent) {
      items.push({
        at: row.createdAt,
        outcome: "accepted",
        source,
        attempt,
        to,
        words: to
          ? `Invoice emailed. Taken by the email service for ${to}.`
          : "Invoice emailed. Taken by the email service.",
        remedy: null,
        willRetry: false,
      });
    } else if (types.invoiceFailed && row.type === types.invoiceFailed) {
      const kind = (text(payload.failureKind) ??
        "unknown") as ReminderFailureKind;
      items.push({
        at: row.createdAt,
        outcome: "failed",
        source,
        attempt,
        to,
        words: "Invoice email not sent.",
        remedy: REMEDY[kind] ?? REMEDY.unknown,
        willRetry: false,
      });
    } else if (row.type === types.delivered) {
      items.push({
        at: row.createdAt,
        outcome: "accepted",
        source,
        attempt,
        to,
        words: to
          ? `Taken by the email service for ${to}.`
          : "Taken by the email service.",
        remedy: null,
        willRetry: false,
      });
    } else if (row.type === types.suppressed) {
      const reason = text(payload.reason) ?? "";
      items.push({
        at: row.createdAt,
        outcome: "skipped",
        source,
        attempt,
        to,
        words: SKIP_WORDS[reason] ?? "Skipped.",
        remedy: null,
        willRetry: false,
      });
    } else if (row.type === types.failed) {
      const kind = (text(payload.failureKind) ??
        "unknown") as ReminderFailureKind;
      const willRetry = payload.retryScheduled === true;
      items.push({
        at: row.createdAt,
        outcome: "failed",
        source,
        attempt,
        to,
        words: willRetry
          ? "Not sent. Capsule will try again by itself."
          : "Not sent.",
        remedy: REMEDY[kind] ?? REMEDY.unknown,
        willRetry,
      });
    }
  }
  return items.sort((left, right) => right.at - left.at);
}

/** Every email of one document (a proposal), newest first: the same words
 * and fixes as the invoice list, named for the document. */
export function documentEmailHistory(
  ledger: LedgerRow[],
  types: { sent: string; failed: string },
  label: string,
): ReminderHistoryItem[] {
  const items: ReminderHistoryItem[] = [];
  for (const row of ledger) {
    const payload = row.payload;
    const to = text(payload.recipientMasked);
    const attempt =
      typeof payload.attempt === "number" ? payload.attempt + 1 : null;
    if (row.type === types.sent) {
      items.push({
        at: row.createdAt,
        outcome: "accepted",
        source: "manual",
        attempt,
        to,
        words: to
          ? `${label} emailed. Taken by the email service for ${to}.`
          : `${label} emailed. Taken by the email service.`,
        remedy: null,
        willRetry: false,
      });
    } else if (row.type === types.failed) {
      const kind = (text(payload.failureKind) ??
        "unknown") as ReminderFailureKind;
      items.push({
        at: row.createdAt,
        outcome: "failed",
        source: "manual",
        attempt,
        to,
        words: `${label} email not sent.`,
        remedy: REMEDY[kind] ?? REMEDY.unknown,
        willRetry: false,
      });
    }
  }
  return items.sort((left, right) => right.at - left.at);
}
