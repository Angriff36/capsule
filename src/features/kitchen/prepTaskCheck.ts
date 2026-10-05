import { ProductionLifecyclePolicy } from "../production/ProductionLifecyclePolicy";

/** Same generated prep lifecycle the kitchen display uses for its Done bump. */
const policy = new ProductionLifecyclePolicy();

/** How a prep task's checkbox reads: ticked, tickable, and the plain reason
 *  when it cannot be ticked. There is no reopen command, so a completed task
 *  stays ticked. */
export type PrepTaskCheck = {
  checked: boolean;
  canComplete: boolean;
  /** One short line under the task; `null` when nothing needs saying. */
  note: string | null;
  tone: "muted" | "danger";
};

export function prepTaskCheck(
  status: string,
  blockReason?: string | null,
): PrepTaskCheck {
  const canComplete = policy
    .prepActions(status)
    .some((action) => action.key === "complete");
  if (status === "completed")
    return { checked: true, canComplete: false, note: null, tone: "muted" };
  if (canComplete)
    return {
      checked: false,
      canComplete,
      note: "In progress",
      tone: "muted",
    };
  switch (status) {
    case "pending":
      return {
        checked: false,
        canComplete,
        note: "Not started. Claim and start it before ticking it off.",
        tone: "muted",
      };
    case "claimed":
      return {
        checked: false,
        canComplete,
        note: "Claimed. Start it before ticking it off.",
        tone: "muted",
      };
    case "blocked":
      return {
        checked: false,
        canComplete,
        note: `Blocked: ${blockReason?.trim() || "see the kitchen lead"}`,
        tone: "danger",
      };
    case "cancelled":
      return {
        checked: false,
        canComplete,
        note: "Cancelled. Nothing to do.",
        tone: "muted",
      };
    default:
      return {
        checked: false,
        canComplete,
        note: "This task can't be ticked off yet.",
        tone: "muted",
      };
  }
}
