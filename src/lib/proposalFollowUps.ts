/**
 * Follow-ups on a sent proposal with no answer, from the owner's May 2026
 * sales audits: one follow-up then silence lost deals, so every open proposal
 * gets a day 3 note, a day 10 check-in and a day 21 "close the file" email.
 * The day 21 words are the email that won the Blaylock deal, kept as written.
 */

const DAY = 24 * 60 * 60 * 1000;

export interface FollowUpStep {
  step: 1 | 2 | 3;
  /** Days after the proposal was sent. */
  day: number;
  label: string;
  note: (clientName: string, title: string) => string;
}

export const FOLLOW_UP_STEPS: readonly FollowUpStep[] = [
  {
    step: 1,
    day: 3,
    label: "Day 3 note",
    note: (name, title) =>
      `Hi ${name}, just making sure the proposal for ${title} reached you. Happy to answer any question, change anything, or set up a tasting.`,
  },
  {
    step: 2,
    day: 10,
    label: "Day 10 check-in",
    note: (name, title) =>
      `Hi ${name}, checking in on ${title}. Is there anything we can change or explain to make it work for you?`,
  },
  {
    step: 3,
    day: 21,
    label: "Day 21 close the file",
    note: (name) =>
      `Hi ${name}, we totally understand if you've gone another direction (congrats either way!) — but if you're still chewing on it, we'd love to chat before we clear the kitchen. Dates are booking up.`,
  },
];

export interface FollowUpProposal {
  _id: string;
  clientId?: unknown;
  title?: unknown;
  status?: unknown;
  sentAt?: unknown;
  deletedAt?: unknown;
  followUpStep?: unknown;
  followUpAt?: unknown;
  priceObjectionAt?: unknown;
}

export interface FollowUpRow {
  proposalId: string;
  clientId: string;
  title: string;
  sentAt: number;
  opened: boolean;
  /** The last step done, if any. */
  done?: FollowUpStep;
  doneAt?: number;
  /** The next step; none once all three are done. */
  next?: FollowUpStep;
  nextDueAt?: number;
  due: boolean;
  /** The client already said it costs too much. */
  saidTooExpensive: boolean;
}

/** Sent or opened proposals with no answer, the ones due now first. */
export function proposalFollowUps(
  proposals: readonly FollowUpProposal[],
  now: number,
): FollowUpRow[] {
  const rows: FollowUpRow[] = [];
  for (const proposal of proposals) {
    const status = String(proposal.status);
    const sentAt = Number(proposal.sentAt);
    if (proposal.deletedAt != null) continue;
    if (status !== "sent" && status !== "viewed") continue;
    if (!Number.isFinite(sentAt) || sentAt <= 0) continue;
    const doneStep = Number(proposal.followUpStep ?? 0);
    const done = FOLLOW_UP_STEPS.find((step) => step.step === doneStep);
    const next = FOLLOW_UP_STEPS.find((step) => step.step === doneStep + 1);
    const nextDueAt = next ? sentAt + next.day * DAY : undefined;
    rows.push({
      proposalId: String(proposal._id),
      clientId: String(proposal.clientId ?? ""),
      title: String(proposal.title ?? ""),
      sentAt,
      opened: status === "viewed",
      done,
      doneAt: done ? Number(proposal.followUpAt) || undefined : undefined,
      next,
      nextDueAt,
      due: nextDueAt !== undefined && nextDueAt <= now,
      saidTooExpensive: proposal.priceObjectionAt != null,
    });
  }
  const order = (row: FollowUpRow) =>
    row.nextDueAt ?? Number.MAX_SAFE_INTEGER - row.sentAt;
  return rows.sort((a, b) => order(a) - order(b));
}
