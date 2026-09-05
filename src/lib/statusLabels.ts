/**
 * User-facing labels + chip tones for enum-ish status strings.
 *
 * Every status/stage/type enum rendered in the UI goes through
 * `formatStatusLabel` so raw DB values (snake_case) never reach users.
 * `statusChipClass` gives StatusChip a deliberate tone per status family:
 * draft=mute, in-motion=info, needs-you=warn, done=ok, dead=danger.
 */

/** Curated spellings the mechanical de-snake can't produce. */
const LABEL_OVERRIDES: Record<string, string> = {
  po_sent: "PO sent",
  on_site: "On-site",
  off_site: "Off-site",
  no_show: "No-show",
  sales_lock: "Sales lock",
};

export function formatStatusLabel(value: string): string {
  const override = LABEL_OVERRIDES[value];
  if (override) return override;
  const words = value.replace(/[_-]+/g, " ").trim();
  if (!words) return value;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type ChipTone = "mute" | "ok" | "info" | "warn" | "danger" | "brand";

export const CHIP_TONE_CLASS: Record<ChipTone, string> = {
  mute: "border-line-2 bg-mute-soft text-ink-2",
  ok: "border-ok/30 bg-ok-soft text-ok",
  info: "border-info/30 bg-info-soft text-info",
  warn: "border-warn/30 bg-warn-soft text-warn",
  danger: "border-danger/30 bg-danger-soft text-danger",
  brand: "border-brand/30 bg-brand-soft text-brand",
};

/**
 * Shared vocabulary across domains (orders, shifts, proposals, deliveries,
 * imports, invoices…). Unknown statuses fall back to the neutral chip.
 */
const TONE_BY_STATUS: Record<string, ChipTone> = {
  // draft / not started
  draft: "mute",
  listed: "mute",
  planned: "mute",
  unassigned: "mute",
  inactive: "mute",
  archived: "mute",
  superseded: "mute",
  deferred: "mute",
  dismissed: "mute",
  // in motion
  in_progress: "info",
  in_transit: "info",
  scheduled: "info",
  assigned: "info",
  claimed: "info",
  packed: "info",
  dispatched: "info",
  sent: "info",
  submitted: "info",
  processing: "info",
  running: "info",
  ordered: "info",
  po_sent: "info",
  invoiced: "info",
  issued: "info",
  // needs attention
  pending: "warn",
  pending_approval: "warn",
  pending_review: "warn",
  needs_review: "warn",
  awaiting_response: "warn",
  partially_received: "warn",
  partially_paid: "warn",
  partial: "warn",
  on_hold: "warn",
  paused: "warn",
  requested: "warn",
  conflict: "warn",
  unmatched: "warn",
  flagged: "warn",
  low_stock: "warn",
  expiring: "warn",
  // done / good
  completed: "ok",
  complete: "ok",
  done: "ok",
  delivered: "ok",
  received: "ok",
  paid: "ok",
  approved: "ok",
  accepted: "ok",
  passed: "ok",
  resolved: "ok",
  matched: "ok",
  verified: "ok",
  published: "ok",
  confirmed: "ok",
  active: "ok",
  available: "ok",
  hired: "ok",
  won: "ok",
  // dead / bad
  cancelled: "danger",
  canceled: "danger",
  failed: "danger",
  rejected: "danger",
  declined: "danger",
  overdue: "danger",
  expired: "danger",
  error: "danger",
  blocked: "danger",
  no_show: "danger",
  terminated: "danger",
  voided: "danger",
  lost: "danger",
  damaged: "danger",
};

export function statusChipClass(status: string): string | undefined {
  const tone = TONE_BY_STATUS[status];
  return tone ? CHIP_TONE_CLASS[tone] : undefined;
}
