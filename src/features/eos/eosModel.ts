import type { Doc } from "../../lib/api";

/**
 * The six key components of EOS (Gino Wickman, "Traction") and the pure
 * figures the EOS pages show for each one. Every number is worked out here
 * from live rows, so the overview, the V/TO and the L10 agree.
 */

export type EosComponent =
  "vision" | "people" | "data" | "issues" | "process" | "traction";

export interface EosComponentInfo {
  key: EosComponent;
  name: string;
  /** The question the component answers, in the book's spirit. */
  question: string;
  /** Where its tools live in Capsule. */
  path: string;
  tools: string;
}

export const EOS_PATHS = {
  overview: "/eos",
  vision: "/eos/vision",
  people: "/eos/people",
  process: "/eos/process",
  l10: "/eos/l10",
} as const;

export const EOS_COMPONENTS: readonly EosComponentInfo[] = [
  {
    key: "vision",
    name: "Vision",
    question: "Does everyone see where we are going, and how we get there?",
    path: EOS_PATHS.vision,
    tools: "V/TO · core values · core focus · 10-year target",
  },
  {
    key: "people",
    name: "People",
    question: "Are the right people in the right seats?",
    path: EOS_PATHS.people,
    tools: "Accountability Chart · People Analyzer · Delegate and Elevate",
  },
  {
    key: "data",
    name: "Data",
    question: "Do a handful of weekly numbers tell us how we are doing?",
    path: `${EOS_PATHS.l10}#scorecard`,
    tools: "Weekly scorecard · owners · goals",
  },
  {
    key: "issues",
    name: "Issues",
    question: "Do we name our problems and solve them for good?",
    path: `${EOS_PATHS.l10}#issues`,
    tools: "Issues list · IDS · long-term issues",
  },
  {
    key: "process",
    name: "Process",
    question: "Is the way we work written down, simple, and followed by all?",
    path: EOS_PATHS.process,
    tools: "Core processes · documented · followed by all",
  },
  {
    key: "traction",
    name: "Traction",
    question: "Do we do what we say, every 90 days and every week?",
    path: EOS_PATHS.l10,
    tools: "Rocks · L10 meeting · to-dos",
  },
];

/** Organizational Checkup: twenty statements, four or three per component. */
export const CHECKUP_STATEMENTS: ReadonlyArray<{
  component: EosComponent;
  text: string;
}> = [
  {
    component: "vision",
    text: "Our vision is written down: core values, core focus, 10-year target, marketing strategy and 3-year picture.",
  },
  {
    component: "vision",
    text: "Everyone in the company knows where we are going and how we will get there.",
  },
  {
    component: "vision",
    text: "We hire, review, reward and let people go by our core values.",
  },
  {
    component: "vision",
    text: "Our core focus is clear, and we say no to work outside it.",
  },
  {
    component: "people",
    text: "Our Accountability Chart is current: every seat has one owner and written roles.",
  },
  {
    component: "people",
    text: "Everyone shares our core values and gets, wants and has the capacity for their seat.",
  },
  {
    component: "people",
    text: "Our leaders delegate well and spend their time on what they love and do best.",
  },
  {
    component: "data",
    text: "We review a weekly scorecard of 5 to 15 numbers, each with an owner and a goal.",
  },
  {
    component: "data",
    text: "Everyone in the company owns at least one number.",
  },
  {
    component: "data",
    text: "Our numbers show us problems before they turn into surprises.",
  },
  {
    component: "issues",
    text: "We keep one open issues list, and people feel safe adding to it.",
  },
  {
    component: "issues",
    text: "We solve issues for good: find the real cause, decide, move on.",
  },
  {
    component: "issues",
    text: "Our leaders are open and honest with each other and hold each other to account.",
  },
  {
    component: "process",
    text: "Our few core processes are named and written down.",
  },
  {
    component: "process",
    text: "Those processes are simple, and everyone follows them.",
  },
  {
    component: "process",
    text: "Our marketing promise (target market, three uniques, proven process, guarantee) is kept at every event.",
  },
  {
    component: "traction",
    text: "Everyone has one to three Rocks every 90 days and finishes most of them.",
  },
  {
    component: "traction",
    text: "Our leaders hold a weekly L10 meeting: same day, same time, same agenda, on time.",
  },
  {
    component: "traction",
    text: "Meeting to-dos get done; we finish at least 9 in 10 each week.",
  },
  {
    component: "traction",
    text: "We set the 1-year plan and the quarterly Rocks together, and the budget follows the plan.",
  },
];

/** Answers 1 to 5 each; the score is their sum, a percent of 100. */
export function checkupScore(answers: readonly number[]): number {
  return answers.reduce((sum, value) => sum + value, 0);
}

/** Each component's percent from one taking's twenty answers. */
export function checkupByComponent(
  answers: string,
): Record<EosComponent, number> {
  const totals = {} as Record<EosComponent, { sum: number; count: number }>;
  CHECKUP_STATEMENTS.forEach((statement, index) => {
    const value = Number(answers[index]) || 0;
    const entry = (totals[statement.component] ??= { sum: 0, count: 0 });
    entry.sum += value;
    entry.count += 1;
  });
  const result = {} as Record<EosComponent, number>;
  for (const info of EOS_COMPONENTS) {
    const entry = totals[info.key];
    result[info.key] = entry
      ? Math.round((entry.sum / (entry.count * 5)) * 100)
      : 0;
  }
  return result;
}

export type VisionItemSection = Doc<"visionItems">["section"];
export type PeopleScore = Doc<"peopleAnalyzerScores">["score"];
export type CoreProcessStage = Doc<"coreProcesses">["stage"];
export type DelegateQuadrant = Doc<"delegateElevateItems">["quadrant"];

export const PEOPLE_SCORE_LABEL: Record<PeopleScore, string> = {
  plus: "+",
  plus_minus: "+/−",
  minus: "−",
};

/** Click order of a People Analyzer cell: empty → + → +/− → − → empty. */
export const PEOPLE_SCORE_CYCLE: readonly (PeopleScore | null)[] = [
  null,
  "plus",
  "plus_minus",
  "minus",
];

/** The three seat questions, scored yes (plus) or no (minus). */
export const GWC = [
  { key: "gets", label: "Gets it" },
  { key: "wants", label: "Wants it" },
  { key: "capacity", label: "Capacity" },
] as const;

export type PeopleVerdict = "unrated" | "above" | "below";

/**
 * Above the bar: every core value marked, none a minus, at most `maxMixed`
 * marked +/−, and a yes on all three seat questions.
 */
export function peopleVerdict(
  scores: ReadonlyMap<string, PeopleScore>,
  valueIds: readonly string[],
  maxMixed: number,
): PeopleVerdict {
  const subjects = [...valueIds, ...GWC.map((entry) => entry.key)];
  if (subjects.some((subject) => !scores.has(subject))) return "unrated";
  const valueMarks = valueIds.map((id) => scores.get(id));
  if (valueMarks.includes("minus")) return "below";
  if (valueMarks.filter((mark) => mark === "plus_minus").length > maxMixed)
    return "below";
  if (GWC.some((entry) => scores.get(entry.key) !== "plus")) return "below";
  return "above";
}

export const PROCESS_STAGES: ReadonlyArray<{
  stage: CoreProcessStage;
  label: string;
  hint: string;
}> = [
  { stage: "named", label: "Named", hint: "On the list of core processes." },
  {
    stage: "documented",
    label: "Documented",
    hint: "The major steps are written down.",
  },
  {
    stage: "simplified",
    label: "Simplified",
    hint: "Steps cut back to the 20% that gets 80% of the result.",
  },
  {
    stage: "followed_by_all",
    label: "Followed by all",
    hint: "Everyone does it this way, and it is checked.",
  },
];

/** Most catering companies start from these; one click adds each one. */
export const SUGGESTED_PROCESSES = [
  "People (hire, train, review)",
  "Marketing",
  "Sales (lead to signed contract)",
  "Event production (booked to served)",
  "Accounting (invoice to paid)",
  "Client retention",
] as const;

export const QUADRANTS: ReadonlyArray<{
  quadrant: DelegateQuadrant;
  title: string;
  hint: string;
  tone: "ok" | "info" | "warn" | "danger";
}> = [
  {
    quadrant: "love_great",
    title: "Love it · great at it",
    hint: "Keep. Spend more time here.",
    tone: "ok",
  },
  {
    quadrant: "like_good",
    title: "Like it · good at it",
    hint: "Keep for now.",
    tone: "info",
  },
  {
    quadrant: "dislike_good",
    title: "Don't like it · good at it",
    hint: "Delegate next.",
    tone: "warn",
  },
  {
    quadrant: "dislike_not_good",
    title: "Don't like it · not good at it",
    hint: "Delegate first.",
    tone: "danger",
  },
];

/** The EOS starting chart: one click lays out these seats. */
export const STARTER_SEATS: ReadonlyArray<{
  title: string;
  roles: string;
  under: "none" | "visionary" | "integrator";
}> = [
  {
    title: "Visionary",
    roles:
      "New ideas and research\nBig relationships\nCulture\nCreative problem solving\nThe 10-year target",
    under: "none",
  },
  {
    title: "Integrator",
    roles:
      "Lead, manage, hold accountable\nRun the L10 and the plan\nP&L results\nSolve issues across the team\nCarry out the business plan",
    under: "visionary",
  },
  {
    title: "Sales & Marketing",
    roles:
      "Marketing\nSales and proposals\nClient follow-up\nTastings\nHit the sales numbers",
    under: "integrator",
  },
  {
    title: "Operations",
    roles:
      "Kitchen and production\nEvent execution\nStaffing\nClient service on the day\nQuality",
    under: "integrator",
  },
  {
    title: "Finance",
    roles:
      "Billing and collections\nPaying bills\nBudget\nReporting\nHR and admin",
    under: "integrator",
  },
];

export function personName(
  people: readonly { _id: string; givenName?: string; familyName?: string }[],
  id: string | null | undefined,
  fallback = "Open",
): string {
  const person = id ? people.find((row) => row._id === id) : undefined;
  return person
    ? `${person.givenName ?? ""} ${person.familyName ?? ""}`.trim() || fallback
    : fallback;
}

export function initials(name: string): string {
  if (name === "No owner" || name === "Open") return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("") || "?"
  );
}

/** Lines of a multi-line text field, blanks dropped. */
export function lines(text: string | null | undefined): string[] {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Start of this quarter (Jan, Apr, Jul, Oct) on this device's clock. */
export function quarterStart(now: Date): Date {
  return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
}

export function quarterLabel(now: Date): string {
  return `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
}

/** Days left until the next quarter starts. */
export function daysLeftInQuarter(now: Date): number {
  const start = quarterStart(now);
  const next = new Date(start.getFullYear(), start.getMonth() + 3, 1);
  return Math.max(0, Math.ceil((next.getTime() - now.getTime()) / 86_400_000));
}

const WEEK_MS = 7 * 86_400_000;

/**
 * To-do completion, the L10's weekly number: of the to-dos due in the last
 * seven days (a to-do without a due date is due a week after it was added),
 * how many were done. EOS aims for 90%.
 */
export function todoCompletion(
  items: readonly {
    kind: string;
    status: string;
    dueAt?: number | null;
    openedAt?: number | null;
  }[],
  now: number,
): { done: number; total: number; percent: number | null } {
  const due = items.filter((row) => {
    if (row.kind !== "todo") return false;
    const at =
      row.dueAt ?? (row.openedAt != null ? row.openedAt + WEEK_MS : null);
    return at != null && at <= now && at > now - WEEK_MS;
  });
  const done = due.filter((row) => row.status === "done").length;
  return {
    done,
    total: due.length,
    percent: due.length === 0 ? null : Math.round((done / due.length) * 100),
  };
}
