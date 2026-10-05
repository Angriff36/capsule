// What an imported event's old-system status (TPP EventStatus) means here.
// Only an old event that is over, or was cancelled, moves on by itself:
// a booked event that is over (Confirmed, Sales Lock, Approved, Final,
// Complete, Closed Out ...) becomes completed (no approval work is drafted
// for it); Cancelled, a lost quote, and a quote whose date passed without a
// booking become cancelled. Events still to come stay in Planning, so the
// normal steps draft their invoice, staff and pack lists when staff move
// them on. TPP's own report prints a sort number before the word
// ("3- Final", "9-Cancelled", "00- Closed", "QUOTE (LOST)").

export type OldSystemFinishedStage = "completed" | "cancelled";

export const OLD_SYSTEM_CANCEL_REASON = "Cancelled in the old system";
export const OLD_SYSTEM_LOST_REASON = "Quote lost in the old system";
export const OLD_SYSTEM_UNBOOKED_REASON =
  "Quote not booked in the old system before its date";

/** "3- Final" -> "final", "QUOTE (LOST)" -> "quote (lost)". */
export function plainOldStatus(rawStatus: string | null | undefined): string {
  return (rawStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\d+\s*-\s*/, "")
    .replace(/\s+/g, " ");
}

const LOST = new Set(["quote (lost)", "lost", "lost quote", "quote lost"]);
const QUOTE = new Set(["quote", "pending approval"]);
const BOOKED = new Set([
  "confirmed",
  "approved",
  "sales lock",
  "sales lock planning",
  "executing",
  "final",
  "complete",
  "completed",
  "closed out",
  "closed",
]);

export function oldSystemFinishedStage(
  rawStatus: string | null | undefined,
  endsAt: number | null | undefined,
  now: number,
): OldSystemFinishedStage | null {
  const status = plainOldStatus(rawStatus);
  if (status === "cancelled" || status === "canceled" || LOST.has(status))
    return "cancelled";
  if (endsAt == null || endsAt >= now) return null;
  if (BOOKED.has(status)) return "completed";
  return QUOTE.has(status) ? "cancelled" : null;
}

/** The cancel reason an old cancelled, lost or unbooked event gets. */
export function oldSystemCancelReason(
  rawStatus: string | null | undefined,
): string {
  const status = plainOldStatus(rawStatus);
  if (LOST.has(status)) return OLD_SYSTEM_LOST_REASON;
  return QUOTE.has(status)
    ? OLD_SYSTEM_UNBOOKED_REASON
    : OLD_SYSTEM_CANCEL_REASON;
}
