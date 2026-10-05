/**
 * Event checklists: a reusable list of to-dos with due times counted from
 * the event's start ("2 days before", "1 hour after"). Putting a checklist
 * on an event makes one to-do per line; the same line on the same event
 * stays one to-do, so a second apply only adds what is missing.
 *
 * Pure. The lines are saved as JSON on EventChecklist.itemsJson.
 */

export type ChecklistPriority = "critical" | "high" | "medium" | "low";

export const CHECKLIST_PRIORITIES: ReadonlyArray<{
  value: ChecklistPriority;
  label: string;
}> = [
  { value: "critical", label: "Must do" },
  { value: "high", label: "High" },
  { value: "medium", label: "Normal" },
  { value: "low", label: "Low" },
];

export type ChecklistLine = {
  key: string;
  title: string;
  details: string;
  priority: ChecklistPriority;
  proofRequired: boolean;
  /** Minutes from the event's start; negative is before it. Null = no time. */
  dueMinutesFromStart: number | null;
};

const PRIORITIES = new Set<string>(["critical", "high", "medium", "low"]);

export function checklistLineKey(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseChecklistLines(
  raw: string | null | undefined,
): ChecklistLine[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const lines: ChecklistLine[] = [];
  for (const row of parsed) {
    const entry = (row ?? {}) as Record<string, unknown>;
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const key = checklistLineKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const due = Number(entry.dueMinutesFromStart);
    lines.push({
      key,
      title,
      details: typeof entry.details === "string" ? entry.details.trim() : "",
      priority: PRIORITIES.has(String(entry.priority))
        ? (entry.priority as ChecklistPriority)
        : "medium",
      proofRequired: entry.proofRequired === true,
      dueMinutesFromStart:
        entry.dueMinutesFromStart == null || !Number.isFinite(due)
          ? null
          : Math.round(due),
    });
  }
  return lines;
}

export function checklistLinesJson(lines: readonly ChecklistLine[]): string {
  return JSON.stringify(
    lines.map(
      ({ title, details, priority, proofRequired, dueMinutesFromStart }) => ({
        title,
        details,
        priority,
        proofRequired,
        dueMinutesFromStart,
      }),
    ),
  );
}

/**
 * One line per to-do, typed as plain text:
 *   "Book the venue permit | 3 days before | must | proof"
 * The parts after the title can come in any order and can be left out.
 */
export function checklistLinesFromText(raw: string): ChecklistLine[] {
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [title = "", ...rest] = line.split("|").map((part) => part.trim());
      let priority: ChecklistPriority = "medium";
      let proofRequired = false;
      let dueMinutesFromStart: number | null = null;
      for (const part of rest) {
        const word = part.toLowerCase();
        if (word === "proof" || word === "needs proof") proofRequired = true;
        else if (word === "must" || word === "must do") priority = "critical";
        else if (word === "high") priority = "high";
        else if (word === "low") priority = "low";
        else if (word === "normal") priority = "medium";
        else {
          const due = dueFromText(word);
          if (due != null) dueMinutesFromStart = due;
        }
      }
      return {
        title,
        details: "",
        priority,
        proofRequired,
        dueMinutesFromStart,
      };
    });
  return parseChecklistLines(JSON.stringify(rows));
}

/** "3 days before", "2 hours after", "at start", "90 minutes before". */
export function dueFromText(raw: string): number | null {
  const word = raw.trim().toLowerCase();
  if (word === "at start" || word === "at the start") return 0;
  const match = word.match(
    /^(\d+(?:\.\d+)?)\s*(minute|minutes|min|hour|hours|hr|day|days)\s*(before|after)$/,
  );
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]!;
  const minutes = unit.startsWith("d")
    ? amount * 1440
    : unit.startsWith("h")
      ? amount * 60
      : amount;
  return Math.round(match[3] === "before" ? -minutes : minutes);
}

export function dueToText(minutes: number | null): string {
  if (minutes == null) return "";
  if (minutes === 0) return "at start";
  const size = Math.abs(minutes);
  const side = minutes < 0 ? "before" : "after";
  if (size % 1440 === 0)
    return `${size / 1440} ${size === 1440 ? "day" : "days"} ${side}`;
  if (size % 60 === 0)
    return `${size / 60} ${size === 60 ? "hour" : "hours"} ${side}`;
  return `${size} minutes ${side}`;
}

export function checklistLinesToText(lines: readonly ChecklistLine[]): string {
  return lines
    .map((line) =>
      [
        line.title,
        dueToText(line.dueMinutesFromStart),
        line.priority === "critical"
          ? "must"
          : line.priority === "medium"
            ? ""
            : line.priority,
        line.proofRequired ? "proof" : "",
      ]
        .filter(Boolean)
        .join(" | "),
    )
    .join("\n");
}

export type ChecklistTaskRow = {
  checklistTemplateId?: string | null;
  templateLineKey?: string | null;
  deletedAt?: number | null;
};

/** The lines of a checklist that are not on the event yet, with due times. */
export function checklistLinesToAdd(
  checklistId: string,
  lines: readonly ChecklistLine[],
  eventStartsAt: number | null | undefined,
  tasks: readonly ChecklistTaskRow[],
): Array<ChecklistLine & { dueAt: number | undefined }> {
  const onEvent = new Set(
    tasks
      .filter(
        (task) =>
          task.deletedAt == null && task.checklistTemplateId === checklistId,
      )
      .map((task) => task.templateLineKey),
  );
  return lines
    .filter((line) => !onEvent.has(line.key))
    .map((line) => ({
      ...line,
      dueAt:
        eventStartsAt != null && line.dueMinutesFromStart != null
          ? eventStartsAt + line.dueMinutesFromStart * 60_000
          : undefined,
    }));
}

export type DueState = "none" | "soon" | "late";

/** A to-do due within a day is "soon"; past its time it is "late". */
export function dueState(
  dueAt: number | null | undefined,
  done: boolean,
  now: number,
): DueState {
  if (done || dueAt == null) return "none";
  if (dueAt < now) return "late";
  return dueAt - now <= 24 * 60 * 60_000 ? "soon" : "none";
}
