// Site visits at a venue (Mangia Venue Partner Playbook section 08): what to
// check in each area, the photos every visit needs, and when a visit is due.
// A visit is saved as one "site_visit" venue note; photos are venue files
// whose name starts with the shot ("Kitchen - IMG_0412.jpg").

const DAY = 86_400_000;

export const SITE_VISIT_AREAS = [
  {
    key: "loadIn",
    label: "Load-in",
    check:
      "Parking near the door, door widths, ramp or elevator, distance from the van to the service area, ground (gravel, concrete, grass)",
    tip: "More than 3 trips to carry equipment in? Note it for staffing.",
  },
  {
    key: "kitchen",
    label: "Kitchen",
    check:
      "Full kitchen, warming only, or none? Ovens, fridge space, prep tables, hot water, outlets, ventilation",
    tip: "No kitchen means a different menu plan.",
  },
  {
    key: "space",
    label: "Event space",
    check:
      "Room size, ceiling height, daylight, where the outlets are, floor, heating and cooling, noise rules",
    tip: "Take photos of every wall and corner.",
  },
  {
    key: "bar",
    label: "Bar area",
    check:
      "Built-in bar or bring one? Water, drain, ice storage, fridges, power, liquor license rules",
    tip: "Decide if we bring the bar setup.",
  },
  {
    key: "bathrooms",
    label: "Bathrooms",
    check: "Where they are from the event space, how clean, accessible",
    tip: "Guest flow: matters for the room layout.",
  },
  {
    key: "storage",
    label: "Storage",
    check: "Where can we stage equipment? Secure? Locked? Open the day before?",
    tip: "Day-before access is a big help.",
  },
  {
    key: "parking",
    label: "Parking",
    check: "Guest parking, vendor parking, accessible spots, overflow",
    tip: "Affects our vans and the guests' arrival.",
  },
  {
    key: "power",
    label: "Power",
    check:
      "Amps available, where the breaker box is, shared circuits, generator needed?",
    tip: "Chafers + lights + DJ can trip breakers. Know the limits.",
  },
] as const;

export type SiteVisitAreaKey = (typeof SITE_VISIT_AREAS)[number]["key"];

/** The photos every site visit needs, in the playbook's order. */
export const SITE_VISIT_SHOTS = [
  { key: "Exterior", hint: "Front entrance, signs, parking lot" },
  { key: "Load-in path", hint: "From the van to the service area, every turn" },
  { key: "Kitchen", hint: "Every appliance, every outlet, prep tables" },
  { key: "Main space", hint: "4 corners and a center shot of the full room" },
  { key: "Bar", hint: "If there is one" },
  { key: "Restrooms", hint: "Where they are" },
  { key: "Damage", hint: "Any damage or wear, to protect us" },
  { key: "Wow features", hint: "What sells the venue: fireplace, view" },
] as const;

export type SiteVisitAnswers = Partial<Record<SiteVisitAreaKey, string>>;

/** The note text for one visit: each area answered, then concerns and ideas. */
export function siteVisitText(input: {
  answers: SiteVisitAnswers;
  concerns?: string;
  dishIdea?: string;
}): string {
  const lines: string[] = [];
  for (const area of SITE_VISIT_AREAS) {
    const answer = input.answers[area.key]?.trim();
    if (answer) lines.push(`${area.label}: ${answer}`);
  }
  const concerns = input.concerns?.trim();
  if (concerns) lines.push(`Concerns: ${concerns}`);
  const idea = input.dishIdea?.trim();
  if (idea) lines.push(`Only-here dish idea: ${idea}`);
  return lines.join("\n");
}

/** The shot a venue file belongs to, from the start of its name. */
export function shotOf(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  for (const shot of SITE_VISIT_SHOTS) {
    if (lower.startsWith(`${shot.key.toLowerCase()} - `)) return shot.key;
  }
  return null;
}

/** How many photos each shot has among the venue's files. */
export function shotCounts(
  files: readonly { fileName: string }[] | undefined,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files ?? []) {
    const shot = shotOf(file.fileName);
    if (shot) counts[shot] = (counts[shot] ?? 0) + 1;
  }
  return counts;
}

type NoteLike = {
  venueId?: unknown;
  category?: unknown;
  postedAt?: unknown;
  deletedAt?: unknown;
};

type EventLike = {
  venueId?: unknown;
  stage?: unknown;
  startsAt?: unknown;
  expectedHeadcount?: unknown;
  title?: unknown;
  deletedAt?: unknown;
};

/** A first large event is one with this many guests or more. */
export const LARGE_EVENT_GUESTS = 100;

const time = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Why this venue needs a site visit now (playbook "When to Do a Site Visit").
 * Reasons are reminders, never a block. A renovation or a venue-only dish
 * idea has no signal in Capsule, so those are left to the rep.
 */
export function siteVisitDue(input: {
  venue: { _id: unknown; partnerTier?: unknown };
  events: readonly EventLike[];
  notes: readonly NoteLike[];
  now: number;
}): { lastVisitAt: number | null; reasons: string[] } {
  const venueId = String(input.venue._id);
  const mine = input.notes.filter(
    (note) => String(note.venueId) === venueId && note.deletedAt == null,
  );
  const visits = mine
    .filter((note) => note.category === "site_visit")
    .map((note) => time(note.postedAt))
    .filter((at): at is number => at != null);
  const lastVisitAt = visits.length > 0 ? Math.max(...visits) : null;
  const reasons: string[] = [];

  if (input.venue.partnerTier && lastVisitAt == null) {
    reasons.push("No site visit yet. Every partner venue needs one.");
  }

  const events = input.events.filter(
    (row) =>
      String(row.venueId ?? "") === venueId &&
      row.deletedAt == null &&
      row.stage !== "cancelled",
  );
  const large = (row: EventLike) =>
    Number(row.expectedHeadcount) >= LARGE_EVENT_GUESTS;
  const pastLarge = events.some(
    (row) => large(row) && (time(row.startsAt) ?? Infinity) <= input.now,
  );
  const nextLarge = events
    .filter((row) => large(row) && (time(row.startsAt) ?? 0) > input.now)
    .sort((a, b) => Number(a.startsAt) - Number(b.startsAt))[0];
  if (nextLarge && !pastLarge && lastVisitAt == null) {
    const when = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(Number(nextLarge.startsAt));
    reasons.push(
      `First large event here (${Number(nextLarge.expectedHeadcount)} guests on ${when}). Visit before it.`,
    );
  }

  if (input.venue.partnerTier === "full_event" && lastVisitAt != null) {
    const days = Math.floor((input.now - lastVisitAt) / DAY);
    if (days > 90) {
      reasons.push(
        `Tier 3 partners get a visit every 3 months. Last visit was ${days} days ago.`,
      );
    }
  }

  const problems = mine
    .filter((note) => note.category === "incident")
    .map((note) => time(note.postedAt))
    .filter((at): at is number => at != null && at > (lastVisitAt ?? 0));
  if (problems.length > 0) {
    const since = lastVisitAt == null ? "" : " since the last visit";
    reasons.push(
      problems.length === 1
        ? `A problem was logged here${since}. Go and look.`
        : `${problems.length} problems were logged here${since}. Go and look.`,
    );
  }

  return { lastVisitAt, reasons };
}
