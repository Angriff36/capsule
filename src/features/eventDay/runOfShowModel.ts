/**
 * Run-of-show tracker model — pure derivation plus per-device alert
 * settings. No React and no Convex here: the page wires hooks around
 * these functions, which keeps the now/next/overdue math testable.
 */
import type { EventDayActivity } from "../../lib/eventDayBriefing";
import type { RunTaskPlan } from "../../lib/eventTimelineRun";
import type { BattleBoardTaskTemplate } from "../events/battleBoardTaskTemplates";

// ---------- alert settings (per device, localStorage) ----------

export type RunSettings = {
  voice: boolean;
  vibrate: boolean;
  alarm: boolean;
  /** Minutes before a task starts for the coming-up alert; 0 = off. */
  leadMinutes: number;
  /** crew = every task; me = only tasks assigned to me / Everyone. */
  scope: "crew" | "me";
};

export const LEAD_MINUTE_CHOICES = [0, 2, 5, 10, 15];

export const DEFAULT_RUN_SETTINGS: RunSettings = {
  voice: false,
  vibrate: true,
  alarm: false,
  leadMinutes: 5,
  scope: "crew",
};

const SETTINGS_KEY = "evd.run.settings.v1";

export function loadRunSettings(): RunSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_RUN_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<RunSettings>;
    return {
      voice: parsed.voice === true,
      vibrate: parsed.vibrate !== false,
      alarm: parsed.alarm === true,
      leadMinutes: LEAD_MINUTE_CHOICES.includes(Number(parsed.leadMinutes))
        ? Number(parsed.leadMinutes)
        : DEFAULT_RUN_SETTINGS.leadMinutes,
      scope: parsed.scope === "me" ? "me" : "crew",
    };
  } catch {
    return DEFAULT_RUN_SETTINGS;
  }
}

export function saveRunSettings(settings: RunSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private mode: keep the settings for this session only.
  }
}

// ---------- category chips ----------

const CATEGORY_LABELS: Record<string, string> = {
  load_in: "Load-in",
  setup: "Setup",
  bar_setup: "Bar",
  kitchen_setup: "Kitchen",
  service: "Service",
  guest_arrival: "Arrival",
  breakdown: "Breakdown",
  load_out: "Load-out",
  staff_arrival: "Crew",
};

export function categoryLabel(category: string | null): string | null {
  const raw = String(category ?? "").trim();
  if (!raw) return null;
  return CATEGORY_LABELS[raw] ?? raw;
}

// ---------- ordering + scoping ----------

/** Guest-facing time: the planned start, falling back to the audit stamp. */
export function effectiveStart(row: EventDayActivity): number | null {
  if (typeof row.startsAt === "number") return row.startsAt;
  if (typeof row.scheduledAt === "number") return row.scheduledAt;
  return null;
}

export function sortForRun(rows: EventDayActivity[]): EventDayActivity[] {
  return [...rows].sort((left, right) => {
    const leftAt = effectiveStart(left);
    const rightAt = effectiveStart(right);
    if (leftAt != null && rightAt != null && leftAt !== rightAt)
      return leftAt - rightAt;
    if (leftAt != null) return -1;
    if (rightAt != null) return 1;
    const leftOrder = left.sortOrder ?? 0;
    const rightOrder = right.sortOrder ?? 0;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return String(left.name ?? "").localeCompare(String(right.name ?? ""));
  });
}

/**
 * "Me" scope: tasks assigned to my Person, plus whole-crew tasks. A Person
 * row carries no FOH/BOH claim, so team-scoped tasks surface as "me" only
 * when they are marked Everyone — team work stays in the crew view.
 */
export function filterMine(
  rows: EventDayActivity[],
  personId: string | null,
): EventDayActivity[] {
  if (personId == null) return [];
  return rows.filter(
    (row) =>
      (row.assigneePersonIds ?? []).includes(personId) ||
      (row.assigneeTeams ?? []).some(
        (team) => team.trim().toLowerCase() === "everyone",
      ),
  );
}

// ---------- now / next / overdue ----------

/** Slack after a task's end before the tracker calls it late. */
export const OVERDUE_GRACE_MS = 10 * 60_000;

export type RunView = {
  /** Most recent task whose window covers "now" and is still open. */
  current: EventDayActivity | null;
  /** Next tasks that have not started yet, soonest first. */
  upcoming: EventDayActivity[];
  /** Tasks past their end (plus grace) that are still open. */
  overdue: EventDayActivity[];
  doneCount: number;
  total: number;
};

export function deriveRunView(
  rows: EventDayActivity[],
  nowMs: number,
): RunView {
  let current: EventDayActivity | null = null;
  let currentAt: number | null = null;
  const upcoming: EventDayActivity[] = [];
  const overdue: EventDayActivity[] = [];
  let doneCount = 0;
  let total = 0;

  for (const row of sortForRun(rows)) {
    if (row.deletedAt != null) continue;
    total++;
    if (row.completedAt != null) {
      doneCount++;
      continue;
    }
    const start = effectiveStart(row);
    if (start == null) continue; // unplanned block: listed, never tracked
    const end = typeof row.endsAt === "number" ? row.endsAt : null;
    if (nowMs < start) {
      upcoming.push(row);
    } else if (end != null && nowMs > end + OVERDUE_GRACE_MS) {
      overdue.push(row);
    } else if (currentAt == null || start >= currentAt) {
      // The latest task whose window covers now is the "what now?" answer.
      current = row;
      currentAt = start;
    }
  }

  return {
    current,
    upcoming: upcoming.slice(0, 3),
    overdue,
    doneCount,
    total,
  };
}

// ---------- alerts ----------

export type RunAlertKind = "lead" | "start" | "overdue";

export type RunAlert = {
  key: string;
  kind: RunAlertKind;
  row: EventDayActivity;
};

/**
 * Alerts inside their fire windows right now. Each alert key fires at
 * most once per session — the page keeps the fired set, so a reload or a
 * late-opened phone stays quiet about old moments.
 */
export function alertsDue(
  rows: EventDayActivity[],
  settings: RunSettings,
  nowMs: number,
): RunAlert[] {
  const out: RunAlert[] = [];
  const leadMs = settings.leadMinutes * 60_000;
  for (const row of rows) {
    if (row.completedAt != null || row.deletedAt != null) continue;
    const start = effectiveStart(row);
    if (start == null) continue;
    if (leadMs > 0 && nowMs >= start - leadMs && nowMs < start) {
      out.push({ key: `${row._id}:lead`, kind: "lead", row });
    }
    if (nowMs >= start && nowMs < start + 90_000) {
      out.push({ key: `${row._id}:start`, kind: "start", row });
    }
    const end = typeof row.endsAt === "number" ? row.endsAt : null;
    if (
      end != null &&
      nowMs >= end + OVERDUE_GRACE_MS &&
      nowMs < end + OVERDUE_GRACE_MS + 90_000
    ) {
      out.push({ key: `${row._id}:overdue`, kind: "overdue", row });
    }
  }
  return out;
}

const ALERT_LEAD_WORDS: Record<RunAlertKind, string> = {
  lead: "Coming up",
  start: "Now",
  overdue: "Still open",
};

/** Spoken text for one alert; teams or names say who it is for. */
export function alertSpeech(
  alert: RunAlert,
  leadMinutes: number,
  personNames?: string,
): string {
  const name = String(alert.row.name ?? "").trim() || "next task";
  const who = personNames ?? (alert.row.assigneeTeams ?? []).join(" and ");
  const lead = alert.kind === "lead" ? ` in ${leadMinutes} minutes:` : ":";
  return `${ALERT_LEAD_WORDS[alert.kind]}${lead} ${name}${
    who.trim().length > 0 ? `. ${who.trim()}` : ""
  }`;
}

// ---------- template plan (auto-fill an empty run of show) ----------

/** Minute windows relative to the guest-facing event start, per group. */
const GROUP_WINDOWS: Record<string, [number, number]> = {
  "PREP / SETUP": [-180, -10],
  "VENUE / ADMIN": [-30, 240],
  SERVICE: [0, 150],
  BAR: [45, 60],
  "FLIP / DESSERT": [150, 185],
  "BREAKDOWN / CLOSEOUT": [210, 300],
};

/**
 * Spread the curated run-of-show templates around the event start: setup
 * before, service during, breakdown after. Deterministic keys make a
 * double tap a no-op instead of a duplicate board.
 */
export function planFromTemplates(
  templates: BattleBoardTaskTemplate[],
  eventId: string,
  eventStartMs: number,
): RunTaskPlan[] {
  const byGroup = new Map<string, BattleBoardTaskTemplate[]>();
  for (const template of templates) {
    byGroup.set(template.group, [
      ...(byGroup.get(template.group) ?? []),
      template,
    ]);
  }
  const planned: RunTaskPlan[] = [];
  let order = 0;
  for (const [group, list] of byGroup) {
    const [fromMin, toMin] = GROUP_WINDOWS[group] ?? [0, 60];
    const span = toMin - fromMin;
    const keyPart = group.replace(/\W+/g, "-").toLowerCase();
    list.forEach((template, index) => {
      const offset =
        list.length === 1
          ? fromMin
          : fromMin + Math.round((span * index) / (list.length - 1));
      planned.push({
        idempotencyKey: `${eventId}:rost:${keyPart}:${index}`,
        eventId,
        name: template.label,
        startsAt: eventStartMs + offset * 60_000,
        category: template.category,
        notes: [template.defaultLocation, template.notes]
          .filter((part) => part.trim().length > 0)
          .join(" — "),
        responsibleParty: template.defaultTeam,
        sortOrder: order++,
      });
    });
  }
  return planned
    .sort((left, right) => left.startsAt - right.startsAt)
    .map((plan, index) => ({ ...plan, sortOrder: index * 10 }));
}
