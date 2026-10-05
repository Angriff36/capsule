// AUTHOR-OWNED — the client's email choice and the quiet hours, checked at the
// moment Capsule sends (PL-CONSENT, AC-110; AC-352 opt-out leg). Nothing is
// decided when a reminder is scheduled: the job reads the client's choice
// when it runs, so a change also stops reminders already queued.

export type ClientEmailChoice = "every_email" | "no_reminders" | "none";

export function clientEmailChoice(raw: unknown): ClientEmailChoice {
  return raw === "no_reminders" || raw === "none" ? raw : "every_email";
}

/** Why this email may not go, in plain words; null = it may go. */
export function clientEmailRefusal(
  choice: ClientEmailChoice,
  kind: "reminder" | "document",
): string | null {
  if (choice === "none") {
    return "This client asked for no emails from us. Change it on the client's page if they want emails again.";
  }
  if (choice === "no_reminders" && kind === "reminder") {
    return "This client asked for no payment reminder emails. Change it on the client's page if they want them again.";
  }
  return null;
}

/** Scheduled client emails wait for the morning in the kitchen's time zone. */
export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 8;

/**
 * When now falls in the quiet hours (9 pm to 8 am in timeZone), the time the
 * quiet hours end; otherwise null. No time zone set = no quiet hours (Capsule
 * cannot know the client's night).
 */
export function quietHoursEnd(
  now: number,
  timeZone: string | null,
): number | null {
  if (!timeZone) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    }).formatToParts(new Date(now));
  } catch {
    return null;
  }
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < QUIET_START_HOUR && hour >= QUIET_END_HOUR) return null;
  const minutesNow = hour * 60 + minute;
  const minutesUntilEnd =
    (QUIET_END_HOUR * 60 - minutesNow + 24 * 60) % (24 * 60);
  return now + minutesUntilEnd * 60_000;
}

/** A stable key for an address the email service refused (never the address). */
export async function recipientKey(email: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(email.trim().toLowerCase()),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
