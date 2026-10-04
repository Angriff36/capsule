// What an imported event's old-system status (TPP EventStatus) means here.
// Only a finished or cancelled old event moves on by itself: Complete and
// Closed Out on an event that is over become completed (no approval work is
// drafted for it), Cancelled becomes cancelled. Live old statuses (Quote,
// Approved, Executing, ...) stay in Planning, so the normal steps draft the
// event's invoice, staff and pack lists when staff move it on.

export type OldSystemFinishedStage = "completed" | "cancelled";

export const OLD_SYSTEM_CANCEL_REASON = "Cancelled in the old system";

export function oldSystemFinishedStage(
  rawStatus: string | null | undefined,
  endsAt: number | null | undefined,
  now: number,
): OldSystemFinishedStage | null {
  const status = (rawStatus ?? "").trim().toLowerCase();
  if (status === "cancelled" || status === "canceled") return "cancelled";
  const finished =
    status === "complete" || status === "completed" || status === "closed out";
  return finished && endsAt != null && endsAt < now ? "completed" : null;
}
