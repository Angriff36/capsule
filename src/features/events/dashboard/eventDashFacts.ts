import type { EventDetailTab } from "../eventRoutes";
import type { EventStage } from "../eventStatus";

/** The linear lifecycle. `cancelled` leaves the track, so it is not a step. */
export const DASH_TRACK: readonly EventStage[] = [
  "quote",
  "planning",
  "pending_approval",
  "approved",
  "sales_lock",
  "executing",
  "final",
  "completed",
  "closed_out",
];

/** Section groups of the event-dashboard design (2026-09-18). */
export const DASH_GROUPS: readonly {
  key: string;
  label: string;
  tabs: readonly EventDetailTab[];
}[] = [
  { key: "overview", label: "Overview", tabs: ["overview"] },
  { key: "plan", label: "Plan", tabs: ["timeline", "layouts", "recurring"] },
  { key: "food", label: "Food", tabs: ["menu", "prep", "inventory"] },
  {
    key: "people",
    label: "People",
    tabs: ["chat", "client", "guests", "staffing"],
  },
  { key: "site", label: "Site", tabs: ["equipment", "photos", "incidents"] },
  { key: "money", label: "Money", tabs: ["margin"] },
];

export const DASH_TAB_LABEL: Record<EventDetailTab, string> = {
  overview: "Overview",
  timeline: "Timeline",
  layouts: "Layouts",
  recurring: "Recurring",
  menu: "Menu",
  prep: "Prep",
  inventory: "Inventory",
  chat: "Chat",
  client: "Client Info",
  guests: "Guests",
  staffing: "Staffing",
  equipment: "Equipment",
  photos: "Photos",
  incidents: "Incidents",
  margin: "Margin",
};

function startOfDay(ms: number): number {
  const day = new Date(ms);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** "12 days out", "Tomorrow", "Today", or "Event date passed". */
export function countdownLabel(
  startsAt: number | null | undefined,
  now = Date.now(),
): string | null {
  if (startsAt == null) return null;
  const days = Math.round((startOfDay(startsAt) - startOfDay(now)) / 864e5);
  if (days > 1) return `${days} days out`;
  if (days === 1) return "Tomorrow";
  if (days === 0) return "Today";
  return "Event date passed";
}

/**
 * The allergy warning from the event notes: the line that names an allergy,
 * from its "ALLERGY:" label on, cut to one readable phrase. The notes are free
 * BEO text; the allergy can sit in the service or the operations notes, and
 * nothing else in the event records allergies at event level.
 */
export function allergyLine(
  ...notes: readonly (string | null | undefined)[]
): string | null {
  for (const note of notes) {
    const line = note
      ?.split(/\r?\n/)
      .find((part) => /allerg/i.test(part))
      ?.trim();
    if (!line) continue;
    const label = line.match(/allerg(?:y|ies)\s*:\s*/i);
    const from = label
      ? line.slice((label.index ?? 0) + label[0].length)
      : line;
    const text = from.trim();
    if (!text) continue;
    if (text.length <= 110) return text;
    const cut = text.slice(0, 110);
    return `${cut.slice(0, cut.lastIndexOf(" ")).trimEnd()}…`;
  }
  return null;
}

/** The first line of a note, cut to `max` characters. */
export function firstLine(
  text: string | null | undefined,
  max = 90,
): string | null {
  const line = text?.trim().split(/\r?\n/)[0]?.trim();
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** "2 hr 14 min" from minutes. */
export function durationLabel(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "—";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/** Title split for the display heading: first word plain, the rest accented. */
export function splitTitle(title: string): { lead: string; accent: string } {
  const [lead = "", ...rest] = title.trim().split(/\s+/);
  return { lead, accent: rest.join(" ") };
}

/**
 * A BEO note split into its labelled lines ("Kitchen: ...", "Rentals: ...").
 * Lines without a short label join the section above; an empty note is one
 * "Operations" section saying so.
 */
export function noteSections(
  text: string | null | undefined,
): { label: string; text: string }[] {
  const lines = (text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [
      { label: "Operations", text: "No operational requirements on file." },
    ];
  }
  const sections: { label: string; text: string }[] = [];
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z /&-]{1,24}):\s*(.*)$/);
    if (match)
      sections.push({ label: match[1]!.trim(), text: match[2]!.trim() });
    else if (sections.length > 0)
      sections[sections.length - 1]!.text += `\n${line}`;
    else sections.push({ label: "Operations", text: line });
  }
  return sections;
}
