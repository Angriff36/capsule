/**
 * The packet content Capsule builds from its own records (spec §14.1): the
 * menu in service order, both pack views, the staff sheet, the rental and
 * decor pull sheet, route / map / load-in / setup diagrams and the binder
 * instruction. The server reads the records; everything here is pure so the
 * printed words and the "which section changed" check share one source.
 */
import { canonicalJson, fingerprintBytes } from "./model";
import type { EventPacketSnapshot } from "./model";

export interface NativeMenuLine {
  name: string;
  course: string | null;
  servings: number | null;
  notes: string | null;
  sortOrder: number | null;
}
export interface NativePackLine {
  description: string;
  quantity: number;
  unit: string;
  category: string | null;
  food: boolean;
  ownership: "owned" | "rented" | "client" | null;
  leftOff: boolean;
}
export interface NativeStaffLine {
  name: string;
  role: string;
  callTime: string | null;
  endTime: string | null;
  /** Only for the lead or a driver (see permittedPhone). */
  phone: string | null;
  status: string;
}
export interface NativePullLine {
  description: string;
  quantity: number;
  unit: string;
  source: "ours" | "vendor";
  decor: boolean;
  vendor: string | null;
  /** Null when nobody is named to bring it back. */
  returnOwner: string | null;
  returnBy: string | null;
  status: string;
}
export interface NativeRun {
  vehicle: string | null;
  trailer: string | null;
  driver: string | null;
  loadingZone: string | null;
  notes: string | null;
}
export interface NativeDiagram {
  name: string;
  instructions: string | null;
}
export interface NativePacketContent {
  eventNumber: string;
  serviceStyle: string | null;
  barService: string | null;
  menu: NativeMenuLine[];
  pack: NativePackLine[];
  staff: NativeStaffLine[];
  pullSheet: NativePullLine[];
  route: {
    venueAddress: string | null;
    mapLink: string | null;
    loadIn: string[];
    runs: NativeRun[];
    diagrams: NativeDiagram[];
  };
}

/** The eight packet parts in the order the binder prints them (spec §14.1). */
export const PACKET_PARTS = [
  { id: "worksheet", title: "Event worksheet" },
  { id: "menu", title: "Event menu" },
  { id: "pack-by-type", title: "Pack list by item type" },
  { id: "pack-by-category", title: "Pack list by warehouse category" },
  { id: "forms", title: "Office planning answers and field forms" },
  { id: "staff", title: "Staff sheet" },
  { id: "pull-sheet", title: "Rental and decor pull sheet" },
  { id: "route", title: "Route, map, load-in and setup diagrams" },
] as const;
export type PacketPart = (typeof PACKET_PARTS)[number]["id"];

/** Dishes in the order they are served; unplaced dishes go last. */
export function menuInServiceOrder(lines: NativeMenuLine[]): NativeMenuLine[] {
  return lines
    .slice()
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.name.localeCompare(b.name),
    );
}

const said = (text: string | null) =>
  !!text?.trim() && !/^(no|none|n\/a|not needed)\.?$/i.test(text.trim());

/**
 * Binder color for teams that still print: red for cook on site / full
 * service, green for limited service, blue clipboard for drop-off, blue
 * half-inch binder for bar. A bar on another service gets its own bar binder.
 */
export function binderInstruction(input: {
  eventNumber: string;
  serviceStyle: string | null;
  barService: string | null;
}): string[] {
  const style = input.serviceStyle?.trim() ?? "";
  const bar = /\bbar\b/i.test(style);
  const color = bar
    ? "Blue half-inch binder (bar)"
    : /drop[\s-]?off/i.test(style)
      ? "Blue clipboard (drop-off)"
      : /limited/i.test(style)
        ? "Green binder (limited service)"
        : /full|cook|on[\s-]?site/i.test(style)
          ? "Red binder (cook on site / full service)"
          : null;
  return [
    color
      ? `Binder: ${color}.`
      : "Binder color not known: choose the service style on the event.",
    ...(!bar && said(input.barService)
      ? ["Bar: add a blue half-inch binder for the bar."]
      : []),
    `Event ${input.eventNumber} goes on the spine and the cover.`,
    "Printing is optional. The packet is ready on screen when its parts are complete.",
  ];
}

/** Item type for the reference view. */
export function packItemType(line: NativePackLine): string {
  if (line.food) return "Food";
  if (line.ownership === "rented") return "Rentals";
  if (line.ownership === "client") return "Client provides";
  return "Equipment and supplies";
}

const categoryLabel = (category: string | null) =>
  category
    ? category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ")
    : "No category";

const amount = (quantity: number, unit: string) =>
  `${quantity} ${unit.replaceAll("_", " ")}`;

/** A lead or a driver prints a phone; other crew phones stay off paper. */
export function permittedPhone(role: string, drives: boolean): boolean {
  return drives || /lead|captain|manager|supervisor/i.test(role);
}

export interface PartBlock {
  kind: "text" | "heading" | "issue";
  text: string;
  small?: boolean;
}

function grouped<T>(
  items: T[],
  group: (item: T) => string,
  line: (item: T) => string,
): PartBlock[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = group(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.keys()]
    .sort((a, b) => a.localeCompare(b))
    .flatMap((key) => [
      { kind: "heading" as const, text: key, small: true },
      ...groups.get(key)!.map((item) => ({
        kind: "text" as const,
        text: line(item),
        small: true,
      })),
    ]);
}

/** What each packet part prints from Capsule's own records. */
export function nativePartBlocks(
  content: NativePacketContent,
): Record<Exclude<PacketPart, "forms">, PartBlock[]> {
  const menu = menuInServiceOrder(content.menu);
  const pack = content.pack.filter((line) => !line.leftOff);
  const packLine = (line: NativePackLine) =>
    `${line.description} - ${amount(line.quantity, line.unit)}`;
  const none = (text: string): PartBlock[] => [
    { kind: "issue", text, small: true },
  ];
  const staff = content.staff
    .slice()
    .sort(
      (a, b) =>
        (a.callTime ?? "99").localeCompare(b.callTime ?? "99") ||
        a.name.localeCompare(b.name),
    );
  const unowned = content.pullSheet.filter((line) => !line.returnOwner);
  return {
    worksheet: binderInstruction(content).map((text) => ({
      kind: "text",
      text,
    })),
    menu: menu.length
      ? menu.map((line, i) => ({
          kind: "text",
          text: `${i + 1}. ${line.name}${line.course ? ` (${line.course})` : ""}${line.servings != null ? ` - ${line.servings} servings` : ""}${line.sortOrder == null ? " - no place in the menu order yet" : ""}${line.notes?.trim() ? `\n   Note: ${line.notes.trim()}` : ""}`,
        }))
      : none("No dishes on the event menu yet."),
    "pack-by-type": pack.length
      ? [
          {
            kind: "text",
            text: "REF - reference copy by item type. Pack from the warehouse category list.",
          },
          ...grouped(pack, packItemType, packLine),
        ]
      : none("No pack list lines yet."),
    "pack-by-category": pack.length
      ? [
          {
            kind: "text",
            text: "Packing copy by warehouse category. Tick each line as it goes on the truck.",
          },
          ...grouped(
            pack,
            (line) => categoryLabel(line.category),
            (line) => `[ ] ${packLine(line)}`,
          ),
        ]
      : none("No pack list lines yet."),
    staff: staff.length
      ? staff.map((line) => ({
          kind: "text",
          text: `${line.name} - ${line.role} | call ${line.callTime ?? "time not set"}${line.endTime ? ` to ${line.endTime}` : ""}${line.phone ? ` | ${line.phone}` : ""}\n   In: ________  Out: ________  Break: ________`,
          small: true,
        }))
      : none("No staff booked on this event yet."),
    "pull-sheet": content.pullSheet.length
      ? [
          ...(unowned.length
            ? none(
                `Nobody is named to bring back: ${unowned.map((line) => line.description).join(", ")}. Add the vendor pickup time or book it as our own.`,
              )
            : []),
          ...grouped(
            content.pullSheet,
            (line) =>
              line.source === "vendor"
                ? `From ${line.vendor ?? "a vendor"}`
                : line.decor
                  ? "Our decor"
                  : "Our equipment",
            (line) =>
              `[ ] ${line.description} - ${amount(line.quantity, line.unit)} | back: ${line.returnOwner ?? "NOT SET"}${line.returnBy ? ` by ${line.returnBy}` : ""}`,
          ),
        ]
      : [{ kind: "text", text: "No rentals or decor booked for this event." }],
    route: [
      {
        kind: "text",
        text: `Venue: ${content.route.venueAddress ?? "address not set"}${content.route.mapLink ? `\nMap: ${content.route.mapLink}` : ""}`,
      },
      ...content.route.loadIn.map((text) => ({
        kind: "text" as const,
        text: `Load-in: ${text}`,
        small: true,
      })),
      ...(content.route.runs.length
        ? content.route.runs.map((run) => ({
            kind: "text" as const,
            text: `Truck run: ${[run.vehicle ?? "vehicle not set", run.trailer].filter(Boolean).join(" + ")} | driver ${run.driver ?? "not set"}${run.loadingZone ? ` | load at ${run.loadingZone}` : ""}${run.notes ? `\n   ${run.notes}` : ""}`,
            small: true,
          }))
        : none("No truck booked for this event yet.")),
      ...(content.route.diagrams.length
        ? content.route.diagrams.map((d) => ({
            kind: "text" as const,
            text: `Setup: ${d.name}${d.instructions ? ` - ${d.instructions}` : ""}`,
            small: true,
          }))
        : none("No setup diagram or layout on this event yet.")),
    ],
  };
}

const WORKSHEET_KEY =
  /^(invoiceNumber|eventDate|eventTitle|guestCount|serviceStyle|clientName|venue\.|contact\.|notes\.|timeline\.|ops\.)/;
const PART_KEYS: Record<Exclude<PacketPart, "forms">, RegExp> = {
  worksheet: WORKSHEET_KEY,
  menu: /^(menu|components|production|sourceContent)\./,
  "pack-by-type": /^packlist\./,
  "pack-by-category": /^packlist\./,
  staff: /^(crew|staffing|staff)\./,
  "pull-sheet": /^equipment\./,
  route: /^(vehicle|trailer|layouts)\./,
};
const PART_NATIVE: Record<
  Exclude<PacketPart, "forms">,
  (c: NativePacketContent) => unknown
> = {
  worksheet: (c) => [c.eventNumber, c.serviceStyle, c.barService],
  menu: (c) => c.menu,
  "pack-by-type": (c) => c.pack,
  "pack-by-category": (c) => c.pack,
  staff: (c) => c.staff,
  "pull-sheet": (c) => c.pullSheet,
  route: (c) => c.route,
};

/**
 * One fingerprint per packet part. A print stores them; a later change to a
 * part's facts or records changes only that part's fingerprint, which names
 * the stale part. Forms follow the decisions and the Final Lock answers.
 */
export async function partFingerprints(
  snapshot: EventPacketSnapshot,
  finalLockJson: string,
): Promise<Record<PacketPart, string>> {
  const hash = (value: unknown) =>
    fingerprintBytes(new TextEncoder().encode(canonicalJson(value)));
  const out = {} as Record<PacketPart, string>;
  for (const part of PACKET_PARTS) {
    if (part.id === "forms") {
      out.forms = await hash({
        issues: snapshot.issues.map((i) => [i.key, i.status]),
        verifications: snapshot.checklistVerifications,
        finalLock: finalLockJson,
      });
      continue;
    }
    const keys = PART_KEYS[part.id];
    out[part.id] = await hash({
      facts: snapshot.facts
        .filter((f) => keys.test(f.fieldKey))
        .map((f) => [f.fieldKey, f.value ?? null, f.unit ?? null, f.status]),
      observations: snapshot.observations
        .filter((o) => keys.test(o.fieldKey))
        .map((o) => [o.fieldKey, o.value, o.unit ?? null]),
      native: snapshot.native ? PART_NATIVE[part.id](snapshot.native) : null,
    });
  }
  return out;
}

/** Titles of the parts whose fingerprint changed since the print. */
export function staleParts(
  printed: Partial<Record<PacketPart, string>> | null,
  current: Record<PacketPart, string>,
): string[] {
  if (!printed) return [];
  return PACKET_PARTS.filter(
    (part) => printed[part.id] !== current[part.id],
  ).map((part) => part.title);
}
