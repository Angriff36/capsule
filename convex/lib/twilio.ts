/**
 * AUTHOR SEAM — Twilio SMS transport for high-urgency alerts.
 * Not Manifest domain logic; provider integration lives outside generated code.
 *
 * Gated on TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in the
 * Convex environment — nothing sends until all three are set (same posture as
 * the Google Calendar / QuickBooks / Stripe integrations). Uses the Twilio REST
 * API directly (Basic auth + form-encoded POST); no SDK dependency needed.
 */

export interface TwilioConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export function twilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );
}

export function requireTwilioConfig(): TwilioConfig {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!accountSid || !authToken || !fromNumber) {
    throw new Error(
      "SMS alerts need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER in the Convex environment.",
    );
  }
  return { accountSid, authToken, fromNumber };
}

/** E.164-ish sanity check. Twilio rejects malformed numbers; skip them early. */
export function isSendablePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = phone.replace(/[^0-9]/gu, "");
  return digits.length >= 7 && digits.length <= 15;
}

function toE164(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/[^0-9]/gu, "")}`;
  const digits = trimmed.replace(/[^0-9]/gu, "");
  // Assume North American numbers when no country code is present.
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

export function safeTwilioMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message
    .replace(/[\r\n]+/gu, " ")
    .replace(/\+?\d[\d\s()-]{6,}\d/gu, "[redacted-number]")
    .slice(0, 500);
}

/** Sends one SMS via Twilio. Returns the Twilio message SID on success. */
export async function sendSms(args: {
  config: TwilioConfig;
  to: string;
  body: string;
  idempotencyKey?: string;
}): Promise<string> {
  const { config } = args;
  const auth = btoa(`${config.accountSid}:${config.authToken}`);
  const form = new URLSearchParams({
    To: toE164(args.to),
    From: config.fromNumber,
    Body: args.body.slice(0, 1600),
  });
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.accountSid)}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(args.idempotencyKey ? { "Idempotency-Key": args.idempotencyKey } : {}),
      },
      body: form,
    },
  );
  const payload = (await response.json().catch(() => null)) as
    | { sid?: string; message?: string; code?: number }
    | null;
  if (!response.ok) {
    const detail = payload?.message
      ? `${payload.message}${payload.code ? ` (code ${payload.code})` : ""}`
      : `Twilio send failed (${response.status}).`;
    throw new Error(detail);
  }
  if (!payload?.sid) {
    throw new Error("Twilio did not return a message id.");
  }
  return payload.sid;
}
