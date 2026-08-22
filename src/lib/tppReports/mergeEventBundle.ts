import {
  emptyEventBundle,
  type BundleMenuItem,
  type BundleTimelineEntry,
  type EventBundle,
  type EventBundlePart,
  type EventBundleSource,
} from "./eventBundle";

/**
 * Reconciles the seven TPP reports into one bundle.
 *
 * The reports overlap and sometimes disagree. Two rules keep that honest:
 * a named order of preference decides each field, and any disagreement that
 * changes what the kitchen or the client sees becomes a warning.
 */

/** Highest authority first, for plain header and party facts. */
const FACT_ORDER: EventBundleSource[] = [
  "beo",
  "eventWorksheet",
  "proposal",
  "orderList",
  "packList",
  "productionWorksheet",
  "battleBoard",
];

/** Keep only the listed sources, in the listed order. */
function orderParts(
  parts: readonly EventBundlePart[],
  order: readonly EventBundleSource[],
): EventBundlePart[] {
  return parts
    .filter((part) => order.includes(part.source))
    .sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source));
}

/** First defined value wins, following the given source order. */
function mergeFields<T extends object>(
  parts: readonly EventBundlePart[],
  pick: (part: EventBundlePart) => T | undefined,
): T {
  const merged: Record<string, unknown> = {};
  for (const part of parts) {
    const value = pick(part);
    if (value === undefined) continue;
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined || entry === "" || merged[key] !== undefined) {
        continue;
      }
      merged[key] = entry;
    }
  }
  return merged as T;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Keep what the higher-authority report said; take only what it lacked. */
function fillMenuGaps(
  existing: BundleMenuItem,
  extra: BundleMenuItem,
): BundleMenuItem {
  return {
    name: existing.name,
    course: existing.course ?? extra.course,
    quantityServings: existing.quantityServings ?? extra.quantityServings,
    description: existing.description ?? extra.description,
    specialInstructions:
      existing.specialInstructions ?? extra.specialInstructions,
    unitPriceCents: existing.unitPriceCents ?? extra.unitPriceCents,
    totalPriceCents: existing.totalPriceCents ?? extra.totalPriceCents,
  };
}

/**
 * Menu quantities come from the event worksheet, which the production
 * worksheet agrees with. The BEO prints the sold count, which can differ.
 */
function mergeMenu(
  parts: readonly EventBundlePart[],
  warnings: string[],
): BundleMenuItem[] {
  const byName = new Map<string, BundleMenuItem>();
  const order: string[] = [];
  const quantityBySource = new Map<string, Map<EventBundleSource, number>>();

  const menuOrder: EventBundleSource[] = [
    "eventWorksheet",
    "beo",
    "proposal",
    "battleBoard",
  ];
  for (const part of orderParts(parts, menuOrder)) {
    for (const item of part.menu ?? []) {
      const key = normalizeName(item.name);
      if (key.length === 0) continue;

      if (item.quantityServings !== undefined) {
        const seen = quantityBySource.get(key) ?? new Map();
        seen.set(part.source, item.quantityServings);
        quantityBySource.set(key, seen);
      }

      const existing = byName.get(key);
      if (existing === undefined) {
        byName.set(key, { ...item });
        order.push(key);
        continue;
      }
      byName.set(key, fillMenuGaps(existing, item));
    }
  }

  for (const [key, seen] of quantityBySource) {
    const values = [...new Set(seen.values())];
    if (values.length <= 1) continue;
    const item = byName.get(key);
    const detail = [...seen.entries()]
      .map(([source, value]) => `${source}=${value}`)
      .join(", ");
    warnings.push(
      `Servings differ for "${item?.name ?? key}" (${detail}). The event worksheet value is used.`,
    );
  }

  return order.map((key) => byName.get(key)!);
}

/**
 * The BEO owns the timeline. The battle board adds the category, team and
 * owner for the steps it repeats, and its own extra steps are kept.
 */
function mergeTimeline(
  parts: readonly EventBundlePart[],
): BundleTimelineEntry[] {
  const base: BundleTimelineEntry[] = [];
  const timelineOrder: EventBundleSource[] = [
    "beo",
    "eventWorksheet",
    "proposal",
  ];
  for (const part of orderParts(parts, timelineOrder)) {
    for (const entry of part.timeline ?? []) {
      const duplicate = base.some(
        (existing) =>
          existing.minutes === entry.minutes &&
          normalizeName(existing.name) === normalizeName(entry.name),
      );
      if (!duplicate) base.push({ ...entry });
    }
  }

  const board = parts.find((part) => part.source === "battleBoard");
  for (const entry of board?.timeline ?? []) {
    const key = normalizeName(entry.name);
    // The board rounds times its own way ("6:29 PM" for a 6:30 PM step).
    const match = base.find(
      (existing) =>
        Math.abs(existing.minutes - entry.minutes) <= 10 &&
        (key.startsWith(normalizeName(existing.name)) ||
          normalizeName(existing.name).startsWith(key)),
    );
    if (match === undefined) {
      base.push({ ...entry });
      continue;
    }
    match.category ??= entry.category;
    match.team ??= entry.team;
    match.staff ??= entry.staff;
    match.notes ??= entry.notes;
  }
  return base.sort((a, b) => a.minutes - b.minutes);
}

/** Combine the parsed reports into one bundle. */
export function mergeEventBundle(
  parts: readonly EventBundlePart[],
): EventBundle {
  const bundle = emptyEventBundle();
  const ordered = orderParts(parts, FACT_ORDER);
  const warnings = parts.flatMap((part) => part.warnings ?? []);

  bundle.header = mergeFields(ordered, (part) => part.header);
  bundle.client = mergeFields(ordered, (part) => part.client);
  bundle.venue = mergeFields(ordered, (part) => part.venue);
  bundle.totals = mergeFields(ordered, (part) => part.totals);
  bundle.notes = mergeFields(ordered, (part) => part.notes);

  bundle.menu = mergeMenu(parts, warnings);
  bundle.timeline = mergeTimeline(parts);
  bundle.prepTasks = parts.flatMap((part) => part.prepTasks ?? []);
  bundle.packList = parts.flatMap((part) => part.packList ?? []);
  bundle.orderLines = parts.flatMap((part) => part.orderLines ?? []);
  bundle.payments = parts.flatMap((part) => part.payments ?? []);
  bundle.staff = parts.flatMap((part) => part.staff ?? []);
  bundle.otherContacts = parts.flatMap((part) => part.otherContacts ?? []);
  bundle.sources = parts.map((part) => part.source);

  const invoices = new Set(
    parts
      .map((part) => part.header?.invoiceNumber)
      .filter((value): value is string => value !== undefined),
  );
  if (invoices.size > 1) {
    warnings.push(
      `Reports carry different invoice numbers (${[...invoices].join(", ")}). They may not describe the same event.`,
    );
  }
  if (bundle.header.eventDate === undefined) {
    warnings.push("No event date was found in any report.");
  }
  if (bundle.menu.length === 0) {
    warnings.push("No menu items were found in any report.");
  }

  bundle.warnings = warnings;
  return bundle;
}
