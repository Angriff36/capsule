/**
 * The shift board on an event's staffing page (owner, 2026-10-14, after the
 * Banani "Shift Manager" design): crew grouped by kind of work on a time
 * grid, with open shifts to fill by dragging a person onto them.
 */

export type RoleGroup =
  "lead" | "culinary" | "server" | "bar" | "host" | "other";

export const GROUPS: readonly {
  key: RoleGroup;
  label: string;
  /** The role a person gets when dropped on the row. */
  role: string;
}[] = [
  { key: "lead", label: "Leads", role: "Lead" },
  { key: "culinary", label: "Culinary", role: "Chef" },
  { key: "server", label: "Servers", role: "Server" },
  { key: "bar", label: "Bar", role: "Bartender" },
  { key: "host", label: "Host / welcome", role: "Host" },
  { key: "other", label: "Other crew", role: "Crew" },
];

/** Which row a free-text role belongs on. */
export function groupOf(role: string | null | undefined): RoleGroup {
  const text = String(role ?? "").toLowerCase();
  if (/lead|captain|coordinator|manager|supervisor/.test(text)) return "lead";
  if (/chef|cook|culinary|kitchen|boh|prep|dish/.test(text)) return "culinary";
  if (/bar|mixolog/.test(text)) return "bar";
  if (/host|welcome|greet|check-?in/.test(text)) return "host";
  if (/serv|foh|wait|runner|buss/.test(text)) return "server";
  return "other";
}

export interface Span {
  start: number;
  end: number;
}

const HOUR = 60 * 60 * 1000;

/** Whole hours that cover every span, at least the crew window. */
export function hourColumns(spans: readonly Span[]): number[] {
  const starts = spans.map((span) => span.start).filter(Number.isFinite);
  const ends = spans.map((span) => span.end).filter(Number.isFinite);
  if (starts.length === 0 || ends.length === 0) return [];
  const first = new Date(Math.min(...starts));
  first.setMinutes(0, 0, 0);
  const last = Math.max(...ends);
  const hours: number[] = [];
  for (let at = first.getTime(); at < last && hours.length < 30; at += HOUR)
    hours.push(at);
  return hours;
}

/** Where a span sits on the grid, as left and width percentages. */
export function place(span: Span, hours: readonly number[]) {
  if (hours.length === 0) return { left: 0, width: 100 };
  const from = hours[0]!;
  const total = hours.length * HOUR;
  const left = Math.max(0, ((span.start - from) / total) * 100);
  const right = Math.min(100, ((span.end - from) / total) * 100);
  return { left, width: Math.max(4, right - left) };
}

export function hoursOf(span: Span): number {
  return Math.round(((span.end - span.start) / HOUR) * 10) / 10;
}

export function clock(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function hourLabel(time: number): string {
  return new Date(time)
    .toLocaleTimeString(undefined, { hour: "numeric" })
    .replace(/\s/g, "");
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    (
      (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts.at(-1)![0] : "")
    ).toUpperCase() || "?"
  );
}

/** A shift longer than this is flagged for overtime. */
export const OVERTIME_HOURS = 8;
