/**
 * Helpers for the printed battle board (the owner's "Mangia Battle Board.pdf",
 * 2026-10-14: "thats what our finished battle board is supposed to look like,
 * and it should auto fill out as much of that information as possible").
 */

/** The labelled lines an import writes into Event.operationalRequirements. */
const OPERATIONAL_LABELS = {
  "Operations:": "operations",
  "Service setup:": "serviceSetup",
  "Kitchen:": "kitchen",
  "Rentals:": "rentals",
  "Decor:": "decor",
  "Menu notes:": "menuNotes",
  "Also:": "also",
} as const;

export type OperationalPart =
  (typeof OPERATIONAL_LABELS)[keyof typeof OPERATIONAL_LABELS] | "other";

/** Split the labelled prose back into the BEO's headed sections. */
export function splitOperational(
  text: string | null | undefined,
): Record<OperationalPart, string> {
  const parts: Record<OperationalPart, string[]> = {
    operations: [],
    serviceSetup: [],
    kitchen: [],
    rentals: [],
    decor: [],
    menuNotes: [],
    also: [],
    other: [],
  };
  let current: OperationalPart = "other";
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const label = (
      Object.keys(OPERATIONAL_LABELS) as (keyof typeof OPERATIONAL_LABELS)[]
    ).find((key) => line.startsWith(key));
    if (label) {
      current = OPERATIONAL_LABELS[label];
      const rest = line.slice(label.length).trim();
      if (rest) parts[current].push(rest);
    } else parts[current].push(line);
  }
  return Object.fromEntries(
    Object.entries(parts).map(([key, lines]) => [key, lines.join("\n")]),
  ) as Record<OperationalPart, string>;
}

/** The overview paragraph and the dietary line of Event.serviceRequirements. */
export function splitService(text: string | null | undefined) {
  const overview: string[] = [];
  const dietary: string[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^dietary:/i.test(line))
      dietary.push(line.replace(/^dietary:\s*/i, ""));
    else overview.push(line);
  }
  return { overview: overview.join(" "), dietary: dietary.join("\n") };
}

export type Answer =
  | { kind: "none" }
  | { kind: "no" }
  | { kind: "chip"; text: string; muted: boolean; note?: string }
  | { kind: "note"; text: string };

/**
 * A day-sheet answer as the board prints it: a coloured tag ("MANGIA",
 * "THIRD PARTY", "Y"), with the words after ">" as a note; "N" in grey; a
 * long sentence as a plain note.
 */
export function readAnswer(value: string | null | undefined): Answer {
  const text = String(value ?? "").trim();
  if (!text || text === "-" || text === "—") return { kind: "none" };
  const [headRaw, ...rest] = text.split(">");
  const head = headRaw!.trim();
  const note = rest.join(">").trim() || undefined;
  if (/^(n|no|none)$/i.test(head)) return { kind: "no" };
  if (head.length > 22 && !note) return { kind: "note", text: head };
  return {
    kind: "chip",
    text: head.toUpperCase(),
    muted: /third|client|venue|planner|n\/a|other/i.test(head),
    note,
  };
}

/** "9/5/2026 - Saturday". */
export function boardDate(time: number | null | undefined): string {
  if (time == null) return "Date not set";
  const day = new Date(time);
  return `${day.getMonth() + 1}/${day.getDate()}/${day.getFullYear()} - ${day.toLocaleDateString("en-US", { weekday: "long" })}`;
}

/**
 * Imports write a crew role as "FOH - Opening captain" (team, then the
 * station note) or "Server". Split it into the roster's columns.
 */
export function splitRole(role: string | null | undefined) {
  const parts = String(role ?? "")
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);
  const first = parts[0] ?? "";
  const team = /^(FOH|BOH)$/i.test(first) ? first.toUpperCase() : "";
  return {
    role: team ? "" : first,
    team,
    station: parts.slice(1).join(" - "),
  };
}

/** The timeline's left bar: FOH green, BOH orange, both or all grey. */
export function teamTone(
  teams: readonly string[],
): "foh" | "boh" | "both" | "" {
  const set = new Set(teams.map((team) => team.toUpperCase()));
  if (set.has("FOH") && set.has("BOH")) return "both";
  if (set.has("FOH")) return "foh";
  if (set.has("BOH")) return "boh";
  return teams.length ? "both" : "";
}

/**
 * Plate names on the buffet line: one per ";" when the answer uses them
 * (plates that carry notes with commas), else one per comma or line.
 */
export function plates(text: string | null | undefined): string[] {
  const raw = String(text ?? "");
  return raw
    .split(raw.includes(";") ? /[;\n]/ : /[,\n]/)
    .map((part) => part.trim().replace(/\.$/, ""))
    .filter(Boolean);
}

/** "appetizer" → "Appetizer", "hors_d'oeuvres" → "Hors d'oeuvres". */
export function courseTitle(course: string): string {
  const text = course.replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The day-sheet fields and the labels a printed battle board uses for them. */
const SCOPE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["Bar service", "barService"],
  ["Cocktail hour food", "cocktailHourFood"],
  ["Dessert", "dessertService"],
  ["Bussing", "bussing"],
  ["Place settings", "placeSettings"],
  ["Passed apps", "passedApps"],
  ["Stationary apps", "stationaryApps"],
  ["Beverages on menu", "beveragesOnMenu"],
  ["Tableside water", "tablesideWater"],
  ["Mangia disposables", "mangiaDisposables"],
  ["Our disposables", "mangiaDisposables"],
  ["Event rentals", "eventRentals"],
  ["Scullery", "scullery"],
  ["Power onsite", "powerOnsite"],
  ["Water onsite", "waterOnsite"],
];

/**
 * An imported battle board keeps its responsibilities chart as one line of
 * text ("Bar service THIRD PARTY | Cocktail hour food MANGIA | ..."). Read it
 * back into the day-sheet fields, and return the text without those parts.
 */
export function readScopeText(text: string): {
  answers: Record<string, string>;
  rest: string;
} {
  const answers: Record<string, string> = {};
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split("|").map((part) => part.trim());
    const left: string[] = [];
    for (const part of parts) {
      const hit = SCOPE_LABELS.find(([label]) =>
        part.toLowerCase().startsWith(label.toLowerCase()),
      );
      const value = hit ? part.slice(hit[0].length).trim() : "";
      if (hit && value) answers[hit[1]] ??= value;
      else if (part) left.push(part);
    }
    if (left.length) kept.push(left.join(" | "));
  }
  return { answers, rest: kept.join("\n") };
}
