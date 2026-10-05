// Moving a partner venue to a new owner (Mangia Venue Partner Playbook
// section 02, Territory Transfer Protocol): the outgoing owner's brief, a
// joint visit, 30 days where the venue can still call the old owner, then
// the new owner confirms the venue is comfortable. The brief is one
// "handoff" venue note; the joint visit and the confirmation are check-in
// notes whose text starts with a fixed word, so they also count as contact.

const DAY = 86_400_000;

/** Playbook: the outgoing owner stays available for 30 days. */
export const SHADOW_DAYS = 30;

export const JOINT_VISIT_PREFIX = "Joint visit: ";
export const CONFIRMED_PREFIX = "Hand-over confirmed: ";

export const HANDOFF_REASONS = [
  "Promotion",
  "Restructuring",
  "Workload balance",
  "Cover while the owner is away",
  "Owner left the company",
] as const;

/** The brief's parts, in the playbook's order. */
export const BRIEF_PARTS = [
  {
    key: "history",
    label: "History",
    hint: "How the relationship started, how it is going",
  },
  {
    key: "contacts",
    label: "Key contacts",
    hint: "Who to call, how they like to be reached",
  },
  { key: "quirks", label: "Quirks", hint: "What only the owner knows" },
  { key: "issues", label: "Open issues", hint: "Problems not yet closed" },
  { key: "upcoming", label: "Upcoming events", hint: "Events booked here" },
] as const;

export type BriefPartKey = (typeof BRIEF_PARTS)[number]["key"];
export type BriefAnswers = Partial<Record<BriefPartKey, string>>;

interface HandoffNoteRow {
  venueId: string;
  category: string;
  content?: string | null;
  authorName?: string | null;
  postedAt?: number | null;
  deletedAt?: number | null;
}

interface HandoffEventRow {
  venueId?: string | null;
  title?: string | null;
  stage?: string | null;
  startsAt?: number | null;
  eventNumber?: string | null;
  deletedAt?: number | null;
}

const one = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

/** The note text: who to whom and why, then each part that was filled in. */
export function handoffText(input: {
  from: string;
  to: string;
  reason?: string;
  answers: BriefAnswers;
}): string {
  const head = `Handed over from ${one(input.from) || "no owner"} to ${one(input.to)}`;
  const lines = [head];
  if (one(input.reason)) lines.push(`Reason: ${one(input.reason)}`);
  for (const part of BRIEF_PARTS) {
    const text = (input.answers[part.key] ?? "").trim();
    if (text) lines.push(`${part.label}: ${text}`);
  }
  return lines.join("\n");
}

/** What the brief starts with: booked events here and recent problems. */
export function handoffDraft(input: {
  venueId: string;
  events: readonly HandoffEventRow[];
  notes: readonly HandoffNoteRow[];
  now: number;
  formatDate: (ms: number) => string;
}): BriefAnswers {
  const upcoming = input.events
    .filter(
      (row) =>
        row.deletedAt == null &&
        String(row.venueId ?? "") === input.venueId &&
        row.stage !== "cancelled" &&
        row.startsAt != null &&
        row.startsAt >= input.now,
    )
    .sort((a, b) => Number(a.startsAt) - Number(b.startsAt))
    .map(
      (row) =>
        `${input.formatDate(Number(row.startsAt))} ${one(row.title) || "Event"}${row.eventNumber ? ` (#${row.eventNumber})` : ""}`,
    );
  const issues = input.notes
    .filter(
      (note) =>
        note.deletedAt == null &&
        String(note.venueId) === input.venueId &&
        note.category === "incident" &&
        note.postedAt != null &&
        input.now - note.postedAt <= 90 * DAY,
    )
    .sort((a, b) => Number(b.postedAt) - Number(a.postedAt))
    .map(
      (note) =>
        `${input.formatDate(Number(note.postedAt))} ${one(note.content).slice(0, 120)}`,
    );
  return {
    upcoming: upcoming.join("; "),
    issues: issues.join("; "),
  };
}

export interface HandoffStatus {
  at: number;
  from: string;
  to: string;
  /** The last day the venue can still call the outgoing owner. */
  shadowUntil: number;
  /** Whole days left of the 30; 0 once over. */
  shadowDaysLeft: number;
  jointVisitAt: number | null;
  confirmedAt: number | null;
  /** True once the venue confirmed: nothing more to do. */
  done: boolean;
  /** Plain reminders for the steps still open. */
  reminders: string[];
}

/** Where the newest hand-over of this venue stands; null when none. */
export function handoffStatus(input: {
  venueId: string;
  notes: readonly HandoffNoteRow[];
  now: number;
}): HandoffStatus | null {
  const mine = input.notes.filter(
    (note) =>
      note.deletedAt == null &&
      note.postedAt != null &&
      String(note.venueId) === input.venueId,
  );
  const brief = mine
    .filter((note) => note.category === "handoff")
    .sort((a, b) => Number(b.postedAt) - Number(a.postedAt))[0];
  if (!brief) return null;
  const at = Number(brief.postedAt);
  const head =
    /^Handed over from (.*) to (.*)$/.exec(
      (brief.content ?? "").split("\n")[0] ?? "",
    ) ?? [];
  const from = head[1] ?? "";
  const to = head[2] ?? "";
  const after = (prefix: string) =>
    mine
      .filter(
        (note) =>
          note.category === "check_in" &&
          Number(note.postedAt) >= at &&
          (note.content ?? "").startsWith(prefix),
      )
      .reduce<number | null>(
        (latest, note) => Math.max(latest ?? 0, Number(note.postedAt)),
        null,
      );
  const jointVisitAt = after(JOINT_VISIT_PREFIX);
  const confirmedAt = after(CONFIRMED_PREFIX);
  const shadowUntil = at + SHADOW_DAYS * DAY;
  const shadowDaysLeft = Math.max(
    0,
    Math.ceil((shadowUntil - input.now) / DAY),
  );
  const reminders: string[] = [];
  if (confirmedAt == null) {
    if (jointVisitAt == null)
      reminders.push(
        `Visit the venue together${from ? ` with ${from}` : ""} and introduce ${to || "the new owner"}`,
      );
    if (shadowDaysLeft === 0)
      reminders.push(
        `30 days are over: ask the venue if they are comfortable with ${to || "the new owner"} and report back`,
      );
  }
  return {
    at,
    from,
    to,
    shadowUntil,
    shadowDaysLeft,
    jointVisitAt,
    confirmedAt,
    done: confirmedAt != null,
    reminders,
  };
}

/**
 * Playbook: "One owner per venue. Always." A reason the partner venue has
 * nobody to look after it, or null when its owner is a current staff member.
 */
export function ownerProblem(input: {
  isPartner: boolean;
  ownerId: string | null | undefined;
  activeStaffIds: ReadonlySet<string>;
  staffLoaded: boolean;
}): string | null {
  if (!input.isPartner || !input.staffLoaded) return null;
  if (!input.ownerId)
    return "No owner: pick one, a partner venue should never be left without";
  if (!input.activeStaffIds.has(String(input.ownerId)))
    return "The owner is no longer on the staff list: hand this venue to someone else";
  return null;
}
