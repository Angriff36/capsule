/**
 * Run-of-show tracker model — pure derivation plus per-device alert
 * settings. No React and no Convex here: the page wires hooks around
 * these functions, which keeps the now/next/overdue math testable.
 */
import type { EventDayActivity } from "../../lib/eventDayBriefing";
import type { RunTaskPlan } from "../../lib/eventTimelineRun";
import type { BattleBoardTaskTemplate } from "../events/battleBoardTaskTemplates";
import { teamsFromResponsibleParty } from "../events/timelineAssigneeOptions";

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

/** Only an operational start is a time; scheduledAt records when the row was made. */
export function effectiveStart(row: EventDayActivity): number | null {
  if (typeof row.startsAt === "number") return row.startsAt;
  return null;
}

export function sortForRun(rows: EventDayActivity[]): EventDayActivity[] {
  return [...rows].sort((left, right) => {
    const leftAt = effectiveStart(left);
    const rightAt = effectiveStart(right);
    if (leftAt != null && rightAt != null && leftAt !== rightAt)
      return leftAt - rightAt;
    if (leftAt != null && rightAt == null) return -1;
    if (rightAt != null && leftAt == null) return 1;
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

// ---------- selected standard blocks ----------

/** Templates describe work, not an event-specific timetable. */
/**
 * Where each standard block usually falls, in minutes from arrival on site,
 * service start or event end, and how long it runs. A block lands on the
 * run with a real time; a planner moves it if this event differs.
 */
const BLOCK_TIMING: Record<
  string,
  { from: "arrive" | "service" | "end"; offset: number; minutes: number }
> = {
  "Staff Huddle / Sign-In": { from: "arrive", offset: 0, minutes: 10 },
  "Unload & Stage": { from: "arrive", offset: 10, minutes: 30 },
  "Build Field Kitchen": { from: "arrive", offset: 20, minutes: 40 },
  "Set up Scullery": { from: "arrive", offset: 30, minutes: 20 },
  "Erect Buffet Table / Set Linen": { from: "arrive", offset: 30, minutes: 30 },
  "Set Buffet Tables & Decor": { from: "arrive", offset: 40, minutes: 40 },
  "Set Apps Table / Grazing Station": {
    from: "arrive",
    offset: 40,
    minutes: 30,
  },
  "Set Dessert Station": { from: "arrive", offset: 50, minutes: 20 },
  "Bar Arrival & Setup": { from: "service", offset: -60, minutes: 45 },
  "Check-in with Cooks/Kitchen": { from: "service", offset: -90, minutes: 10 },
  "Ceremony Quiet Time": { from: "service", offset: -30, minutes: 30 },
  "Apps Huddle": { from: "service", offset: -30, minutes: 10 },
  "Light Sternos & Fill Chafers": { from: "service", offset: -30, minutes: 15 },
  "Team Huddle / Diet Callouts": { from: "service", offset: -20, minutes: 10 },
  "Land Food in Chafers": { from: "service", offset: -15, minutes: 15 },
  "Buffet Open": { from: "service", offset: 0, minutes: 0 },
  "Buffet Service (Serve/Carve)": { from: "service", offset: 0, minutes: 90 },
  "Passed Apps Service": { from: "service", offset: 0, minutes: 60 },
  "Water Table Service": { from: "service", offset: 0, minutes: 120 },
  "Flip Buffet for Dessert": { from: "service", offset: 90, minutes: 15 },
  "Dessert Service": { from: "service", offset: 105, minutes: 45 },
  "Buffet Close": { from: "service", offset: 120, minutes: 0 },
  "Bar Closing": { from: "end", offset: -15, minutes: 15 },
  "Final Bussing (Own Disposables)": { from: "end", offset: 0, minutes: 30 },
  "Strike & Load Out": { from: "end", offset: 0, minutes: 60 },
  "Final Pass / Walkthrough": { from: "end", offset: 30, minutes: 15 },
  "Venue Access / Send-Off / Lock-Up": { from: "end", offset: 60, minutes: 15 },
  "Clock Out": { from: "end", offset: 90, minutes: 0 },
};

export type RunAnchors = {
  arriveAt: number | null;
  serviceAt: number | null;
  endsAt: number | null;
};

export function planFromTemplates(
  templates: BattleBoardTaskTemplate[],
  eventId: string,
  anchors?: RunAnchors,
): RunTaskPlan[] {
  const timeFor = (label: string) => {
    const rule = BLOCK_TIMING[label];
    const base =
      rule && anchors
        ? rule.from === "arrive"
          ? anchors.arriveAt
          : rule.from === "service"
            ? anchors.serviceAt
            : anchors.endsAt
        : null;
    if (!rule || base == null) return {};
    let startsAt = base + rule.offset * 60_000;
    let endsAt = startsAt + rule.minutes * 60_000;
    // Setup work happens between arrival and service: nothing before the
    // crew is there, nothing running past the first guest.
    const { arriveAt, serviceAt } = anchors!;
    const setupWork =
      rule.from === "arrive" || (rule.from === "service" && rule.offset < 0);
    if (setupWork && arriveAt != null && startsAt < arriveAt) {
      endsAt += arriveAt - startsAt;
      startsAt = arriveAt;
    }
    if (setupWork && serviceAt != null && endsAt > serviceAt) {
      endsAt = Math.max(startsAt, serviceAt);
      if (startsAt > serviceAt) startsAt = serviceAt;
    }
    return rule.minutes > 0 ? { startsAt, endsAt } : { startsAt };
  };
  return templates.map((template) => ({
    ...timeFor(template.label),
    idempotencyKey: `${eventId}:block:${encodeURIComponent(template.group)}:${encodeURIComponent(template.label)}`,
    eventId,
    name: template.label,
    category: template.category,
    notes: [template.defaultLocation, template.notes]
      .filter((part) => part.trim().length > 0)
      .join(" — "),
    responsibleParty: template.defaultTeam,
    assigneeTeams: teamsFromResponsibleParty(template.defaultTeam),
  }));
}
