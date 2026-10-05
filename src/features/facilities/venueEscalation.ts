// Problems at a partner venue (Mangia Venue Partner Playbook section 14,
// Escalation Policy): four levels, who handles each and how fast, the
// common cases, and what is still owed on each problem. A problem is an
// "incident" venue note with a level; closing it keeps what was done.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export type EscalationLevel = 1 | 2 | 3 | 4;

export const ESCALATION_LEVELS: Record<
  EscalationLevel,
  {
    name: string;
    covers: string;
    who: string;
    speed: string;
    /** Hours to settle (level 3: to meet face to face; level 4: at once). */
    settleHours: number;
  }
> = {
  1: {
    name: "Routine",
    covers:
      "Small logistics hiccups, schedule changes, menu changes, small mix-ups",
    who: "The venue's owner at our company",
    speed: "Settle the same day",
    settleHours: 24,
  },
  2: {
    name: "Elevated",
    covers:
      "Level 1 problems that keep coming back, client complaints, equipment damage under $500, trouble with venue staff, missed referrals",
    who: "The venue's owner; tell a manager within 4 hours",
    speed: "Settle within 48 hours",
    settleHours: 48,
  },
  3: {
    name: "Serious",
    covers:
      "$1,000+ at stake, contract disputes, the venue talking to other caterers, safety concerns, equipment damage of $500 or more",
    who: "A manager takes over",
    speed: "Manager answers within 2 hours; meet face to face within 72 hours",
    settleHours: 72,
  },
  4: {
    name: "Critical",
    covers:
      "Partnership at risk, legal trouble, food safety, an injury, damage to our name, the venue threatening to drop us",
    who: "A manager and the head chef, at once",
    speed: "Now. All hands",
    settleHours: 0,
  },
};

/** The playbook's common cases, with their level and what to do. */
export const ESCALATION_CASES: {
  label: string;
  level: EscalationLevel;
  todo: string;
}[] = [
  {
    label: "The venue stops answering calls and texts",
    level: 2,
    todo: "Try text, call and email over 48 hours. No answer: tell a manager. Do not show up unannounced.",
  },
  {
    label: "The venue books another caterer for an event",
    level: 3,
    todo: "Get the facts first: an old commitment, a request we could not handle, or shopping around? A manager has the conversation.",
  },
  {
    label: "The venue owner is rude to our staff",
    level: 3,
    todo: "The staff member steps away calmly and tells the venue's owner at once; a manager speaks to the venue owner.",
  },
  {
    label: "Food safety problem at the venue",
    level: 4,
    todo: "Stop service at once. Protect the guests. Call a manager. Write everything down. Do not serve until it is safe.",
  },
  {
    label: "The venue wants new partnership terms",
    level: 3,
    todo: "Do not negotiate. Listen, write it down, thank them, and say a manager will follow up.",
  },
  {
    label: "The venue works with a listing site or platform",
    level: 2,
    todo: "Not a threat by itself. Ask what they get from it and tell a manager.",
  },
  {
    label: "A client threatens legal action about an event here",
    level: 4,
    todo: "A manager and the head chef at once. Do not answer the client without a manager. Keep everything in writing.",
  },
];

/** The playbook's hard rules, shown with the problem form. */
export const HARD_RULES = [
  "Never argue with a venue owner in front of their clients or staff.",
  "No discount, refund or credit without a manager's yes.",
  "Never threaten to pull out of a venue: that is a manager's call.",
  "Put it in writing after every call: “Following up on our conversation, here is what we agreed…”",
  "Not sure if you should raise it? Raise it.",
];

interface ProblemNote {
  _id: string;
  venueId: string;
  category: string;
  content?: string | null;
  escalationLevel?: number | null;
  postedAt?: number | null;
  resolvedAt?: number | null;
  deletedAt?: number | null;
}

interface ContactNote {
  venueId: string;
  category: string;
  postedAt?: number | null;
  deletedAt?: number | null;
}

export interface OpenProblem<N extends ProblemNote = ProblemNote> {
  note: N;
  level: EscalationLevel | null;
  /** When it should be settled; null with no level. */
  dueAt: number | null;
  overdue: boolean;
}

/** The first words of a problem, so two reminders are told apart. */
const shortText = (content: string | null | undefined) => {
  const text = (content ?? "").replace(/\s+/g, " ").trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
};

const asLevel = (value: number | null | undefined): EscalationLevel | null =>
  value === 1 || value === 2 || value === 3 || value === 4 ? value : null;

/**
 * Problems at the venue not yet closed, worst level first, and the
 * follow-ups owed after a closed level 3 or 4 problem.
 */
export function problemStatus<N extends ProblemNote>(input: {
  venueId: string;
  notes: readonly N[];
  contacts: readonly ContactNote[];
  now: number;
  formatDate: (ms: number) => string;
}): { open: OpenProblem<N>[]; reminders: string[] } {
  const { now } = input;
  const mine = input.notes.filter(
    (note) =>
      note.deletedAt == null &&
      note.postedAt != null &&
      note.category === "incident" &&
      String(note.venueId) === input.venueId,
  );
  const open = mine
    .filter((note) => note.resolvedAt == null)
    .map((note) => {
      const level = asLevel(note.escalationLevel);
      const dueAt =
        level == null
          ? null
          : Number(note.postedAt) + ESCALATION_LEVELS[level].settleHours * HOUR;
      return { note, level, dueAt, overdue: dueAt != null && dueAt < now };
    })
    .sort(
      (a, b) =>
        (b.level ?? 0) - (a.level ?? 0) ||
        Number(a.note.postedAt) - Number(b.note.postedAt),
    );

  const reminders: string[] = [];
  for (const problem of open) {
    if (problem.level != null && problem.overdue)
      reminders.push(
        `Level ${problem.level} problem “${shortText(problem.note.content)}” from ${input.formatDate(Number(problem.note.postedAt))} is not closed: ${ESCALATION_LEVELS[problem.level].speed.toLowerCase()}`,
      );
  }
  // Playbook: after a level 3 or 4 problem, check with the venue within 7
  // days that the relationship is stable.
  const contacts = input.contacts.filter(
    (note) =>
      note.deletedAt == null &&
      note.postedAt != null &&
      String(note.venueId) === input.venueId &&
      (note.category === "check_in" || note.category === "thank_you"),
  );
  for (const note of mine) {
    const level = asLevel(note.escalationLevel);
    if (note.resolvedAt == null || level == null || level < 3) continue;
    if (now - note.resolvedAt > 30 * DAY) continue;
    const checked = contacts.some(
      (contact) => Number(contact.postedAt) >= Number(note.resolvedAt),
    );
    if (!checked)
      reminders.push(
        `Check with the venue that all is well after the level ${level} problem “${shortText(note.content)}” (by ${input.formatDate(Number(note.resolvedAt) + 7 * DAY)})`,
      );
  }
  return { open, reminders };
}
