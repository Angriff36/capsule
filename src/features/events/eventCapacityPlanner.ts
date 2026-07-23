const DAY_MS = 86_400_000;

export interface CapacityPlannerEvent {
  _id: string;
  title: string;
  stage: string;
  deletedAt?: number | null;
  startsAt?: number | null;
  endsAt?: number | null;
  venueId?: string | null;
  venueName?: string | null;
  venueCapacity?: number | null;
  expectedHeadcount?: number | null;
}

export interface CapacityPlannerGuest {
  eventId: string;
  rsvpStatus: string;
  deletedAt?: number | null;
}

export interface CapacityPlannerVenue {
  _id: string;
  capacity?: number | null;
}

export type CapacityHeat = "unknown" | "quiet" | "steady" | "busy" | "full";

export interface CapacityEventCard {
  event: CapacityPlannerEvent;
  confirmedHeadcount: number;
  capacity: number | null;
  utilization: number | null;
  heat: CapacityHeat;
  conflictingEventIds: string[];
}

export interface CapacityConflict {
  first: CapacityPlannerEvent;
  second: CapacityPlannerEvent;
}

export interface CapacityCalendarDay {
  key: string;
  startsAt: number;
  events: CapacityEventCard[];
}

export interface CapacityPlan {
  valid: boolean;
  rangeStart: number;
  rangeEndExclusive: number;
  days: CapacityCalendarDay[];
  events: CapacityEventCard[];
  conflicts: CapacityConflict[];
  confirmedHeadcount: number;
  recordedCapacity: number;
  overCapacityCount: number;
}

export function localDateInput(value: number | Date): string {
  const date = typeof value === "number" ? new Date(value) : value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function startOfLocalDay(value: number | Date): number {
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function addLocalDays(value: number, days: number): number {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

export function parseLocalDate(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return Number.NaN;
  }
  return date.getTime();
}

function heatFor(utilization: number | null): CapacityHeat {
  if (utilization == null) return "unknown";
  if (utilization < 0.35) return "quiet";
  if (utilization < 0.7) return "steady";
  if (utilization < 1) return "busy";
  return "full";
}

function overlaps(
  first: Pick<CapacityPlannerEvent, "startsAt" | "endsAt">,
  second: Pick<CapacityPlannerEvent, "startsAt" | "endsAt">,
): boolean {
  return (
    first.startsAt != null &&
    first.endsAt != null &&
    second.startsAt != null &&
    second.endsAt != null &&
    first.startsAt < second.endsAt &&
    second.startsAt < first.endsAt
  );
}

function isBookableEvent(event: CapacityPlannerEvent): boolean {
  return event.deletedAt == null && event.stage !== "cancelled";
}

export function buildCapacityPlan({
  events,
  guests,
  venues,
  startDate,
  endDate,
}: {
  events: readonly CapacityPlannerEvent[];
  guests: readonly CapacityPlannerGuest[];
  venues: readonly CapacityPlannerVenue[];
  startDate: string;
  endDate: string;
}): CapacityPlan {
  const rangeStart = parseLocalDate(startDate);
  const rangeEnd = parseLocalDate(endDate);
  const valid =
    Number.isFinite(rangeStart) &&
    Number.isFinite(rangeEnd) &&
    rangeStart <= rangeEnd;
  const rangeEndExclusive = valid ? addLocalDays(rangeEnd, 1) : Number.NaN;

  if (!valid) {
    return {
      valid: false,
      rangeStart,
      rangeEndExclusive,
      days: [],
      events: [],
      conflicts: [],
      confirmedHeadcount: 0,
      recordedCapacity: 0,
      overCapacityCount: 0,
    };
  }

  const visibleEvents = events
    .filter(
      (event) =>
        isBookableEvent(event) &&
        event.startsAt != null &&
        event.endsAt != null &&
        event.startsAt < rangeEndExclusive &&
        event.endsAt > rangeStart,
    )
    .sort((first, second) => (first.startsAt ?? 0) - (second.startsAt ?? 0));

  const confirmedByEvent = new Map<string, number>();
  for (const guest of guests) {
    if (guest.deletedAt != null || guest.rsvpStatus !== "confirmed") continue;
    confirmedByEvent.set(
      guest.eventId,
      (confirmedByEvent.get(guest.eventId) ?? 0) + 1,
    );
  }

  const venueCapacity = new Map(
    venues.map((venue) => [venue._id, venue.capacity ?? null]),
  );
  const conflictsByEvent = new Map<string, Set<string>>();
  const conflicts: CapacityConflict[] = [];

  for (let index = 0; index < visibleEvents.length; index += 1) {
    const first = visibleEvents[index];
    if (!first.venueId) continue;
    for (let cursor = index + 1; cursor < visibleEvents.length; cursor += 1) {
      const second = visibleEvents[cursor];
      if ((second.startsAt ?? 0) >= (first.endsAt ?? 0)) break;
      if (second.venueId !== first.venueId || !overlaps(first, second))
        continue;
      conflicts.push({ first, second });
      const firstSet = conflictsByEvent.get(first._id) ?? new Set<string>();
      const secondSet = conflictsByEvent.get(second._id) ?? new Set<string>();
      firstSet.add(second._id);
      secondSet.add(first._id);
      conflictsByEvent.set(first._id, firstSet);
      conflictsByEvent.set(second._id, secondSet);
    }
  }

  const cards = visibleEvents.map((event): CapacityEventCard => {
    const confirmedHeadcount = confirmedByEvent.get(event._id) ?? 0;
    const fallbackCapacity = event.venueId
      ? venueCapacity.get(event.venueId)
      : null;
    const rawCapacity = event.venueCapacity ?? fallbackCapacity ?? null;
    const capacity =
      rawCapacity != null && rawCapacity > 0 ? rawCapacity : null;
    const utilization = capacity == null ? null : confirmedHeadcount / capacity;
    return {
      event,
      confirmedHeadcount,
      capacity,
      utilization,
      heat: heatFor(utilization),
      conflictingEventIds: [...(conflictsByEvent.get(event._id) ?? [])],
    };
  });

  const cardsByDay = new Map<string, CapacityEventCard[]>();
  for (const card of cards) {
    const visibleStart = Math.max(
      card.event.startsAt ?? rangeStart,
      rangeStart,
    );
    const key = localDateInput(visibleStart);
    cardsByDay.set(key, [...(cardsByDay.get(key) ?? []), card]);
  }

  const days: CapacityCalendarDay[] = [];
  for (
    let day = rangeStart;
    day < rangeEndExclusive;
    day = addLocalDays(day, 1)
  ) {
    const key = localDateInput(day);
    days.push({ key, startsAt: day, events: cardsByDay.get(key) ?? [] });
  }

  return {
    valid: true,
    rangeStart,
    rangeEndExclusive,
    days,
    events: cards,
    conflicts,
    confirmedHeadcount: cards.reduce(
      (total, card) => total + card.confirmedHeadcount,
      0,
    ),
    recordedCapacity: cards.reduce(
      (total, card) => total + (card.capacity ?? 0),
      0,
    ),
    overCapacityCount: cards.filter(
      (card) =>
        card.capacity != null && card.confirmedHeadcount > card.capacity,
    ).length,
  };
}

export const CAPACITY_DAY_MS = DAY_MS;
