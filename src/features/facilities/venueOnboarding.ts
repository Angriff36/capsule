// Getting a new partner venue started (Mangia Venue Partner Playbook
// section 04, Venue Onboarding SOP): the eight steps after the venue is
// approved and given a tier, with the playbook's timeline. Steps that
// Capsule can see in the venue file count by themselves (venue details,
// a site visit, venue-only dishes, the first event and its debrief); the
// others are check-in notes whose text starts with a fixed word, so they
// also count as contact. The team brief is a pinned venue note.

const DAY = 86_400_000;

export const FIRST_MEETING_PREFIX = "First meeting: ";
export const MENU_READY_PREFIX = "Venue menu ready: ";
export const AGREEMENT_PREFIX = "Partnership agreement signed: ";
export const REVIEW_PREFIX = "30-day review: ";
export const TEAM_BRIEF_PREFIX = "Team brief\n";
/** For a venue that was a partner before Capsule tracked these steps. */
export const ONBOARDED_PREFIX = "Onboarding finished: ";

export type OnboardingStepKey =
  | "approved"
  | "meeting"
  | "file"
  | "site"
  | "menu"
  | "agreement"
  | "brief"
  | "firstEvent"
  | "review";

export interface OnboardingStep {
  key: OnboardingStepKey;
  label: string;
  /** What to do, in the playbook's words. */
  detail: string;
  doneAt: number | null;
  /** When the playbook wants it done; null = no date yet. */
  dueAt: number | null;
  /** Shown when the step is not done: what is still missing. */
  missing?: string[];
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  doneCount: number;
  /** All steps done, or the venue was marked as set up earlier. */
  finished: boolean;
  finishedAt: number | null;
  /** Plain reminders for late steps. */
  reminders: string[];
}

interface OnboardingVenue {
  _id: string;
  partnerTier?: string | null;
  partnerSince?: number | null;
  addressLine1?: string | null;
  latitude?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  capacity?: number | null;
  seatedCapacity?: number | null;
  standingCapacity?: number | null;
  kitchenAccess?: string | null;
  hasOven?: boolean | null;
  hasRefrigeration?: boolean | null;
  loadInInstructions?: string | null;
  loadInFrom?: string | null;
  parkingAvailable?: boolean | null;
  powerAvailable?: boolean | null;
  restrictions?: string | null;
}

interface OnboardingNote {
  venueId: string;
  eventId?: string | null;
  category: string;
  content?: string | null;
  postedAt?: number | null;
  deletedAt?: number | null;
}

interface OnboardingEvent {
  _id: string;
  venueId?: string | null;
  stage?: string | null;
  startsAt?: number | null;
  title?: string | null;
}

const filled = (value: string | null | undefined) =>
  (value ?? "").trim().length > 0;

/** The venue details the playbook's venue file needs that are still blank. */
export function missingVenueFile(venue: OnboardingVenue): string[] {
  const missing: string[] = [];
  if (!filled(venue.addressLine1) && venue.latitude == null)
    missing.push("address");
  if (
    !filled(venue.contactName) ||
    (!filled(venue.contactPhone) && !filled(venue.contactEmail))
  )
    missing.push("venue contact");
  if (
    !(venue.capacity && venue.capacity > 0) &&
    venue.seatedCapacity == null &&
    venue.standingCapacity == null
  )
    missing.push("capacity");
  if (
    !filled(venue.kitchenAccess) &&
    venue.hasOven == null &&
    venue.hasRefrigeration == null
  )
    missing.push("kitchen");
  if (!filled(venue.loadInInstructions) && !filled(venue.loadInFrom))
    missing.push("load-in");
  if (venue.parkingAvailable == null) missing.push("parking");
  if (venue.powerAvailable == null) missing.push("power");
  if (!filled(venue.restrictions))
    missing.push("rules (candles, confetti, noise)");
  return missing;
}

/** The first event at the venue since it became a partner (not cancelled). */
export function firstPartnerEvent(input: {
  venueId: string;
  since: number;
  events: readonly OnboardingEvent[];
}): OnboardingEvent | null {
  return (
    input.events
      .filter(
        (row) =>
          String(row.venueId ?? "") === input.venueId &&
          row.stage !== "cancelled" &&
          row.startsAt != null &&
          row.startsAt >= input.since - DAY,
      )
      .sort((a, b) => Number(a.startsAt) - Number(b.startsAt))[0] ?? null
  );
}

/** Where a partner venue stands on the eight start-up steps; null when not a partner. */
export function onboardingStatus(input: {
  venue: OnboardingVenue;
  notes: readonly OnboardingNote[];
  events: readonly OnboardingEvent[];
  /** Dishes offered only at this venue; null when not known (list screen). */
  venueOnlyDishCount: number | null;
  now: number;
  formatDate: (ms: number) => string;
}): OnboardingStatus | null {
  const { venue, now } = input;
  if (!venue.partnerTier) return null;
  const venueId = String(venue._id);
  const since = venue.partnerSince ?? null;
  const mine = input.notes.filter(
    (note) =>
      note.deletedAt == null &&
      note.postedAt != null &&
      String(note.venueId) === venueId,
  );
  const latest = (match: (note: OnboardingNote) => boolean) =>
    mine
      .filter(match)
      .reduce<number | null>(
        (best, note) => Math.max(best ?? 0, Number(note.postedAt)),
        null,
      );
  const checkIn = (prefix: string) =>
    latest(
      (note) =>
        note.category === "check_in" && (note.content ?? "").startsWith(prefix),
    );
  const week = (n: number) => (since == null ? null : since + n * 7 * DAY);

  const finishedEarlier = checkIn(ONBOARDED_PREFIX);
  const missingFile = missingVenueFile(venue);
  const firstEvent =
    since == null
      ? null
      : firstPartnerEvent({ venueId, since, events: input.events });
  const firstEventAt = firstEvent?.startsAt ?? null;
  const firstEventHeld = firstEventAt != null && firstEventAt <= now;
  const debriefAt =
    firstEvent == null
      ? null
      : latest(
          (note) =>
            note.category === "debrief" &&
            String(note.eventId ?? "") === String(firstEvent._id),
        );
  const menuNoteAt = checkIn(MENU_READY_PREFIX);

  const steps: OnboardingStep[] = [
    {
      key: "approved",
      label: "Approved and given a tier",
      detail: "The venue is approved and its partnership level is picked",
      doneAt: since,
      dueAt: null,
    },
    {
      key: "meeting",
      label: "First meeting at the venue",
      detail:
        "Meet the owner or manager there, walk the space, learn their calendar and pain points. Bring the info packet, sample menus and a few proposals",
      doneAt: checkIn(FIRST_MEETING_PREFIX),
      dueAt: week(1),
    },
    {
      key: "file",
      label: "Venue file filled in",
      detail:
        "Address, contact, capacity, kitchen, load-in, parking, power and the venue's rules",
      doneAt: missingFile.length === 0 ? (since ?? now) : null,
      dueAt: week(2),
      missing: missingFile,
    },
    {
      key: "site",
      label: "Site visit",
      detail:
        "Walk every area with the site visit checklist and take the photos",
      doneAt: latest((note) => note.category === "site_visit"),
      dueAt: week(2),
    },
    {
      key: "menu",
      label: "Venue menu",
      detail:
        "A menu that suits the kitchen, the service style and the guest count; one or two dishes only at this venue. The chef signs off new recipes",
      doneAt:
        menuNoteAt ??
        (input.venueOnlyDishCount != null && input.venueOnlyDishCount > 0
          ? (since ?? now)
          : null),
      dueAt: week(3),
    },
    {
      key: "agreement",
      label: "Partnership agreement",
      detail:
        "The owner settles the terms: exclusivity, commission, who owns leads, cancellations, insurance",
      doneAt: checkIn(AGREEMENT_PREFIX),
      dueAt: week(4),
    },
    {
      key: "brief",
      label: "Brief for the team",
      detail:
        "Address, load-in, key contacts, kitchen, quirks and emergency contacts for everyone who works there",
      doneAt: latest(
        (note) =>
          note.category === "logistics" &&
          (note.content ?? "").startsWith(TEAM_BRIEF_PREFIX),
      ),
      dueAt: week(4),
    },
    {
      key: "firstEvent",
      label: "First event, with a debrief",
      detail:
        firstEventAt == null
          ? "No event booked here yet. The owner is on site the whole first event; debrief within 48 hours"
          : firstEventHeld
            ? `${input.formatDate(firstEventAt)}: write the team debrief within 48 hours`
            : `${input.formatDate(firstEventAt)}: the owner is on site the whole event`,
      doneAt: firstEventHeld && debriefAt != null ? debriefAt : null,
      dueAt: firstEventAt == null ? null : firstEventAt + 2 * DAY,
    },
    {
      key: "review",
      label: "30-day review",
      detail:
        "With the owner: did it work, any red flags, is the tier right? Adjust before the next event",
      doneAt: checkIn(REVIEW_PREFIX),
      dueAt: firstEventAt == null ? null : firstEventAt + 30 * DAY,
    },
  ];

  const doneCount = steps.filter((step) => step.doneAt != null).length;
  const allDoneAt =
    doneCount === steps.length
      ? Math.max(...steps.map((step) => Number(step.doneAt)))
      : null;
  const finishedAt = finishedEarlier ?? allDoneAt;
  const finished = finishedAt != null;
  const reminders = finished
    ? []
    : steps
        .filter(
          (step) =>
            step.doneAt == null &&
            step.dueAt != null &&
            step.dueAt < now &&
            !(step.key === "menu" && input.venueOnlyDishCount == null),
        )
        .map(
          (step) =>
            `Getting started: ${step.label.toLowerCase()} was due ${input.formatDate(Number(step.dueAt))}`,
        );
  return { steps, doneCount, finished, finishedAt, reminders };
}

/** The team brief's first draft, from what the venue file already says. */
export function teamBriefDraft(input: {
  venue: OnboardingVenue & {
    name?: string | null;
    city?: string | null;
    accessNotes?: string | null;
    loadOutBy?: string | null;
  };
}): string {
  const v = input.venue;
  const line = (label: string, value: string | null | undefined) =>
    filled(value) ? `${label}: ${(value ?? "").trim()}` : `${label}: `;
  const kitchen = [
    v.kitchenAccess,
    v.hasOven == null ? null : v.hasOven ? "oven" : "no oven",
    v.hasRefrigeration == null
      ? null
      : v.hasRefrigeration
        ? "fridge space"
        : "no fridge space",
  ]
    .filter(filled)
    .join(", ");
  const loadIn = [
    v.loadInInstructions,
    v.loadInFrom ? `from ${v.loadInFrom}` : null,
    v.loadOutBy ? `out by ${v.loadOutBy}` : null,
  ]
    .filter(filled)
    .join(", ");
  const contact = [v.contactName, v.contactPhone, v.contactEmail]
    .filter(filled)
    .join(", ");
  return [
    line("Address", [v.addressLine1, v.city].filter(filled).join(", ")),
    line("Load-in", loadIn),
    line("Key contacts", contact),
    line("Kitchen", kitchen),
    line(
      "Quirks and rules",
      [v.restrictions, v.accessNotes].filter(filled).join("; "),
    ),
    line("Emergency contacts", ""),
  ].join("\n");
}
