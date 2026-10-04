// What an imported event's old-system status (TPP EventStatus) means here.
// Only a finished or cancelled old event moves on by itself: Complete, Final
// and Closed Out on an event that is over become completed (no approval work
// is drafted for it), Cancelled and a lost quote become cancelled. Live old
// statuses (Quote, Confirmed, Sales Lock, ...) stay in Planning, so the
// normal steps draft the event's invoice, staff and pack lists when staff
// move it on. TPP's own report prints a sort number before the word
// ("3- Final", "9-Cancelled", "00- Closed", "QUOTE (LOST)").

export type OldSystemFinishedStage = "completed" | "cancelled";

export const OLD_SYSTEM_CANCEL_REASON = "Cancelled in the old system";
export const OLD_SYSTEM_LOST_REASON = "Quote lost in the old system";

/** "3- Final" -> "final", "QUOTE (LOST)" -> "quote (lost)". */
export function plainOldStatus(rawStatus: string | null | undefined): string {
  return (rawStatus ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\d+\s*-\s*/, "")
    .replace(/\s+/g, " ");
}

const LOST = new Set(["quote (lost)", "lost", "lost quote", "quote lost"]);
const FINISHED = new Set([
  "complete",
  "completed",
  "closed out",
  "closed",
  "final",
]);

export function oldSystemFinishedStage(
  rawStatus: string | null | undefined,
  endsAt: number | null | undefined,
  now: number,
): OldSystemFinishedStage | null {
  const status = plainOldStatus(rawStatus);
  if (status === "cancelled" || status === "canceled" || LOST.has(status))
    return "cancelled";
  return FINISHED.has(status) && endsAt != null && endsAt < now
    ? "completed"
    : null;
}

/** The cancel reason an old cancelled or lost event gets. */
export function oldSystemCancelReason(
  rawStatus: string | null | undefined,
): string {
  return LOST.has(plainOldStatus(rawStatus))
    ? OLD_SYSTEM_LOST_REASON
    : OLD_SYSTEM_CANCEL_REASON;
}
