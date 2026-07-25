/** CapsuleX Event.stage values from generated Convex schema. */
export const EVENT_STAGES = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "cancelled",
  "closed_out",
] as const;

export type EventStage = (typeof EVENT_STAGES)[number];

export const STAGE_LABEL: Record<EventStage, string> = {
  quote: "Quote",
  planning: "Planning",
  pending_approval: "Pending approval",
  approved: "Approved",
  sales_lock: "Sales lock",
  executing: "Executing",
  final: "Final",
  completed: "Completed",
  cancelled: "Cancelled",
  closed_out: "Closed out",
};

/** @deprecated alias for chip helpers that still say status */
export type EventStatus = EventStage;
export const EVENT_STATUSES = EVENT_STAGES;
export const STATUS_LABEL = STAGE_LABEL;
