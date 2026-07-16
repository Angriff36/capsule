/** Display labels for Event status chips — UI only; mutations enforce transitions. */
export const EVENT_STATUSES = [
  "draft",
  "confirmed",
  "completed",
  "archived",
  "cancelled",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};
