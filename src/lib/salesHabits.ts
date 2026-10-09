/**
 * Sales habits from the owner's May 2026 sales audits ("Metrics to Track"):
 * how fast a new inquiry gets its first answer (goal: under 4 hours), what
 * share of sent proposals get a "too expensive" answer, and the lost deal
 * log - every proposal declined, expired, or cold for 30 days, with its
 * value, last touch and reason.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const REPLY_GOAL_HOURS = 4;
export const REPLY_WINDOW_DAYS = 90;
export const PROPOSAL_WINDOW_DAYS = 365;
export const COLD_AFTER_DAYS = 30;

export interface HabitLead {
  _id: string;
  _creationTime?: number;
  capturedAt?: unknown;
  firstRepliedAt?: unknown;
  closedAt?: unknown;
  proposalId?: unknown;
  sourceStage?: unknown;
  deletedAt?: unknown;
}

export interface HabitProposal {
  _id: string;
  clientId?: unknown;
  title?: unknown;
  status?: unknown;
  total?: unknown;
  sentAt?: unknown;
  viewedAt?: unknown;
  followUpAt?: unknown;
  declinedAt?: unknown;
  declineReason?: unknown;
  expiredAt?: unknown;
  priceObjectionAt?: unknown;
  deletedAt?: unknown;
}

function time(value: unknown): number | undefined {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n > 0 ? n : undefined;
}

export interface ReplyTimes {
  /** Inquiries in the window with a first reply marked. */
  replied: number;
  /** Of those, answered within the goal. */
  withinGoal: number;
  /** Middle reply time in hours; undefined when none replied. */
  medianHours?: number;
  /** Open inquiries in the window still waiting for a first answer. */
  waiting: number;
}

/**
 * First-reply times of inquiries that came in during the last 90 days.
 * Imported history (an old system's stage) has no reply record and is left
 * out; so is an inquiry answered with a proposal and never marked.
 */
export function replyTimes(
  leads: readonly HabitLead[],
  now: number,
): ReplyTimes {
  const from = now - REPLY_WINDOW_DAYS * DAY;
  const hours: number[] = [];
  let waiting = 0;
  for (const lead of leads) {
    if (lead.deletedAt != null || lead.sourceStage != null) continue;
    const inAt = time(lead.capturedAt) ?? time(lead._creationTime);
    if (inAt === undefined || inAt < from) continue;
    const repliedAt = time(lead.firstRepliedAt);
    if (repliedAt !== undefined) {
      hours.push(Math.max(0, repliedAt - inAt) / HOUR);
    } else if (lead.closedAt == null && lead.proposalId == null) {
      waiting += 1;
    }
  }
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  return {
    replied: hours.length,
    withinGoal: hours.filter((h) => h <= REPLY_GOAL_HOURS).length,
    medianHours:
      hours.length === 0
        ? undefined
        : hours.length % 2
          ? hours[mid]
          : (hours[mid - 1] + hours[mid]) / 2,
    waiting,
  };
}

export interface PriceObjections {
  /** Proposals sent in the last 12 months. */
  sent: number;
  /** Of those, the ones the client called too expensive. */
  objected: number;
}

export function priceObjections(
  proposals: readonly HabitProposal[],
  now: number,
): PriceObjections {
  const from = now - PROPOSAL_WINDOW_DAYS * DAY;
  let sent = 0;
  let objected = 0;
  for (const proposal of proposals) {
    if (proposal.deletedAt != null) continue;
    const sentAt = time(proposal.sentAt);
    if (sentAt === undefined || sentAt < from) continue;
    sent += 1;
    if (time(proposal.priceObjectionAt) !== undefined) objected += 1;
  }
  return { sent, objected };
}

export interface LostDeal {
  proposalId: string;
  clientId: string;
  title: string;
  value: number;
  lastTouch: number;
  reason: string;
  /** Still open: a follow-up or a decline can still be recorded. */
  cold: boolean;
}

/**
 * Proposals lost in the last 12 months: declined, expired, or sent with no
 * touch (send, opening, follow-up) for 30 days. Newest last touch first.
 */
export function lostDeals(
  proposals: readonly HabitProposal[],
  now: number,
): LostDeal[] {
  const from = now - PROPOSAL_WINDOW_DAYS * DAY;
  const rows: LostDeal[] = [];
  for (const proposal of proposals) {
    if (proposal.deletedAt != null) continue;
    const status = String(proposal.status);
    const touches = [
      proposal.sentAt,
      proposal.viewedAt,
      proposal.followUpAt,
      proposal.priceObjectionAt,
    ]
      .map(time)
      .filter((t): t is number => t !== undefined);
    if (touches.length === 0) continue;
    const lastTouch = Math.max(...touches);
    const pricey = time(proposal.priceObjectionAt) !== undefined;
    let reason: string;
    let endedAt: number;
    if (status === "declined") {
      const written = String(proposal.declineReason ?? "").trim();
      reason = written || (pricey ? "" : "Declined, no reason given");
      endedAt = time(proposal.declinedAt) ?? lastTouch;
    } else if (status === "expired") {
      reason = "Ran out with no answer";
      endedAt = time(proposal.expiredAt) ?? lastTouch;
    } else if (
      (status === "sent" || status === "viewed") &&
      lastTouch <= now - COLD_AFTER_DAYS * DAY
    ) {
      reason = `No answer for ${Math.floor((now - lastTouch) / DAY)} days`;
      endedAt = lastTouch;
    } else {
      continue;
    }
    if (endedAt < from) continue;
    if (pricey) {
      reason = reason ? `Said too expensive · ${reason}` : "Said too expensive";
    }
    rows.push({
      proposalId: String(proposal._id),
      clientId: String(proposal.clientId ?? ""),
      title: String(proposal.title ?? ""),
      value: Number(proposal.total) || 0,
      lastTouch,
      reason,
      cold: status === "sent" || status === "viewed",
    });
  }
  return rows.sort((a, b) => b.lastTouch - a.lastTouch);
}
