// PL-PROPOSAL-DRAFT (AC-409/AC-416/AC-417/AC-431, spec §7.1-§7.2.6-7): the
// pure half of "build the proposal from its event". The Convex seam
// (convex/lib/proposalGenerate.ts) reads the event and the draft, and this
// module decides what a (re)build writes, what it must leave alone, and what
// the office still has to look at. It never makes up a fact or a price: a dish
// with no menu price becomes a draft issue, not a line.

/** The values a generated proposal line was written with. */
export type LineValues = {
  description: string;
  pricingBasis: string;
  unitPrice: number;
  quantity: number;
  menuDishId: string | null;
};

/** Where a section's words and numbers came from. */
export type SourceRef = { table: string; id: string };

/** One line the event asks for right now (a dish on the event menu). */
export type LineSource = {
  sourceKey: string;
  fingerprint: string;
  values: LineValues;
  sortOrder: number;
  sources: SourceRef[];
};

/** Event facts copied onto the proposal header. */
export type EventFacts = {
  eventDate: number | null;
  eventEndDate: number | null;
  eventType: string | null;
  venueName: string | null;
  venueAddress: string | null;
  guestCount: number;
};

export type GeneratedLine = {
  sourceKey: string;
  lineId: string;
  values: LineValues;
  fingerprint: string;
};

/** Stored on Proposal.generationJson after each build. */
export type GenerationRecord = {
  v: 1;
  eventId: string;
  facts: EventFacts;
  lines: GeneratedLine[];
  /** Sources staff took out of the proposal; a rebuild never puts them back. */
  excluded: string[];
};

/** The draft's current line as stored. */
export type ExistingLine = { id: string; live: boolean; values: LineValues };

export type LinePlan = {
  add: LineSource[];
  revise: { lineId: string; source: LineSource }[];
  remove: string[];
  /** Generated lines staff changed; the rebuild keeps their version. */
  kept: {
    lineId: string;
    sourceKey: string;
    sourceChanged: boolean;
    sourceGone: boolean;
  }[];
  excluded: string[];
  /** Lines carried into the next record unchanged (untouched, same source). */
  carried: GeneratedLine[];
};

const cents = (n: number) => Math.round((Number(n) || 0) * 100);

export function sameValues(a: LineValues, b: LineValues): boolean {
  return (
    a.description.trim() === b.description.trim() &&
    a.pricingBasis === b.pricingBasis &&
    cents(a.unitPrice) === cents(b.unitPrice) &&
    Number(a.quantity) === Number(b.quantity) &&
    (a.menuDishId ?? null) === (b.menuDishId ?? null)
  );
}

export function parseGenerationRecord(
  json: string | null | undefined,
): GenerationRecord | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as GenerationRecord;
    return parsed && parsed.v === 1 && Array.isArray(parsed.lines)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/**
 * Decide the line changes for a (re)build. Staff wording, prices, quantities
 * and override reasons live on lines staff changed, and those lines are kept
 * as they are; a line staff removed stays out; lines staff typed by hand have
 * no record entry and are never touched.
 */
export function planLines(
  record: GenerationRecord | null,
  sources: LineSource[],
  existing: Map<string, ExistingLine>,
): LinePlan {
  const plan: LinePlan = {
    add: [],
    revise: [],
    remove: [],
    kept: [],
    excluded: [],
    carried: [],
  };
  const excluded = new Set(record?.excluded ?? []);
  const bySource = new Map(
    (record?.lines ?? []).map((line) => [line.sourceKey, line]),
  );
  const current = new Map(sources.map((source) => [source.sourceKey, source]));

  for (const prior of record?.lines ?? []) {
    const row = existing.get(prior.lineId);
    if (!row || !row.live) {
      excluded.add(prior.sourceKey);
      continue;
    }
    const source = current.get(prior.sourceKey);
    const touched = !sameValues(row.values, prior.values);
    if (touched) {
      plan.kept.push({
        lineId: prior.lineId,
        sourceKey: prior.sourceKey,
        sourceChanged: !!source && source.fingerprint !== prior.fingerprint,
        sourceGone: !source,
      });
    } else if (!source) {
      plan.remove.push(prior.lineId);
    } else if (
      !sameValues(source.values, prior.values) ||
      source.fingerprint !== prior.fingerprint
    ) {
      plan.revise.push({ lineId: prior.lineId, source });
    } else {
      plan.carried.push(prior);
    }
  }
  for (const source of sources) {
    if (!bySource.has(source.sourceKey) && !excluded.has(source.sourceKey))
      plan.add.push(source);
  }
  plan.excluded = [...excluded].sort();
  return plan;
}

export type DraftIssue = { code: string; message: string; recordIds: string[] };

export type SectionReport = {
  key: "event" | "menu" | "pricing" | "terms" | "venue" | "service" | "rentals";
  sources: SourceRef[];
  stale: boolean;
  /** Why it is out of date, in plain words. */
  staleReasons: string[];
};

export function sameFacts(a: EventFacts, b: EventFacts): boolean {
  return (
    (a.eventDate ?? null) === (b.eventDate ?? null) &&
    (a.eventEndDate ?? null) === (b.eventEndDate ?? null) &&
    (a.eventType ?? null) === (b.eventType ?? null) &&
    (a.venueName ?? null) === (b.venueName ?? null) &&
    (a.venueAddress ?? null) === (b.venueAddress ?? null) &&
    a.guestCount === b.guestCount
  );
}

/**
 * Which parts of a built draft no longer match the event. A kept staff line
 * whose dish changed (or left the event) is named, so a person decides.
 */
export function staleSections(input: {
  record: GenerationRecord;
  facts: EventFacts;
  sources: LineSource[];
  existing: Map<string, ExistingLine>;
}): { event: string[]; menu: string[] } {
  const event: string[] = [];
  if (!sameFacts(input.record.facts, input.facts)) {
    event.push(
      "The event's date, type, venue or guest count changed after this proposal was built.",
    );
  }
  const menu: string[] = [];
  const plan = planLines(input.record, input.sources, input.existing);
  if (plan.add.length > 0)
    menu.push("The event menu has dishes this proposal does not show yet.");
  if (plan.remove.length > 0 || plan.revise.length > 0) {
    menu.push("The event menu changed after this proposal was built.");
  }
  for (const kept of plan.kept) {
    const name =
      input.existing.get(kept.lineId)?.values.description ?? "A line";
    if (kept.sourceGone)
      menu.push(
        `${name}: the dish is no longer on the event, but staff changed this line, so it stays until someone removes it.`,
      );
    else if (kept.sourceChanged)
      menu.push(
        `${name}: the event dish changed after staff changed this line. Check it.`,
      );
  }
  return { event, menu };
}
