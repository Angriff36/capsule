import type { Doc } from "../../lib/api";

type DateHold = Doc<"dateHolds">;
type WaitlistEntry = Doc<"dateWaitlistEntries">;

/** Default soft-hold length offered when sales places a hold. */
export const DEFAULT_HOLD_DAYS = 7;

/** "YYYY-MM-DD" in the browser's local calendar (a Saturday stays Saturday). */
export function localDateKey(value: number | Date): string {
  const date = typeof value === "number" ? new Date(value) : value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Noon local time of a date key, so formatting never slips a day. */
export function dateKeyToMs(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12).getTime();
}

/** A hold counts while it is held and its expiry has not passed. */
export function isActiveHold(hold: DateHold, now: number): boolean {
  return (
    hold.deletedAt == null && hold.status === "held" && hold.expiresAt > now
  );
}

/** Held but past its expiry: expired in effect, before anyone records it. */
export function isLapsedHold(hold: DateHold, now: number): boolean {
  return (
    hold.deletedAt == null && hold.status === "held" && hold.expiresAt <= now
  );
}

export function effectiveHoldStatus(hold: DateHold, now: number): string {
  return isLapsedHold(hold, now) ? "expired" : hold.status;
}

/** When a hold stopped claiming its date, or null while it still does. */
export function holdEndedAt(hold: DateHold, now: number): number | null {
  if (hold.deletedAt != null) return null;
  if (hold.status === "released")
    return hold.releasedAt ?? hold.updatedAt ?? now;
  if (hold.status === "expired" || isLapsedHold(hold, now)) {
    return hold.expiresAt;
  }
  return null;
}

export function activeHoldsOn(
  holds: readonly DateHold[] | undefined,
  dateKey: string,
  now: number,
): DateHold[] {
  return (holds ?? []).filter(
    (hold) => hold.holdDate === dateKey && isActiveHold(hold, now),
  );
}

export function isOpenWaitlistEntry(entry: WaitlistEntry): boolean {
  return (
    entry.deletedAt == null &&
    (entry.status === "waiting" || entry.status === "offered")
  );
}

/** Open waitlist entries for a date, first come first served. */
export function waitlistFor(
  entries: readonly WaitlistEntry[] | undefined,
  dateKey: string,
): WaitlistEntry[] {
  return (entries ?? [])
    .filter((entry) => entry.holdDate === dateKey && isOpenWaitlistEntry(entry))
    .sort(
      (a, b) =>
        (a.queuedAt ?? a.createdAt ?? 0) - (b.queuedAt ?? b.createdAt ?? 0),
    );
}

export interface OpenedDate {
  dateKey: string;
  /** When the last hold on the date ended. */
  openedAt: number;
  next: WaitlistEntry;
}

/**
 * Dates that opened up for the waitlist: a hold on the date ended (released
 * or past expiry), no hold still claims it, the date is today or later, and
 * someone is still waiting (not yet offered).
 */
export function openedDates(
  holds: readonly DateHold[] | undefined,
  entries: readonly WaitlistEntry[] | undefined,
  now: number,
): OpenedDate[] {
  const today = localDateKey(now);
  const byDate = new Map<string, DateHold[]>();
  for (const hold of holds ?? []) {
    if (hold.deletedAt != null || hold.holdDate < today) continue;
    byDate.set(hold.holdDate, [...(byDate.get(hold.holdDate) ?? []), hold]);
  }
  const out: OpenedDate[] = [];
  for (const [dateKey, dateHolds] of byDate) {
    if (dateHolds.some((hold) => isActiveHold(hold, now))) continue;
    const ended = dateHolds
      .map((hold) => holdEndedAt(hold, now))
      .filter((at): at is number => at != null);
    if (ended.length === 0) continue;
    const next = waitlistFor(entries, dateKey)[0];
    if (!next || next.status !== "waiting") continue;
    out.push({ dateKey, openedAt: Math.max(...ended), next });
  }
  return out;
}
