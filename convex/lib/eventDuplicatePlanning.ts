// Planning-argument builder for duplicating an Event into a fresh planning
// Event (AC-239 remaining slice). Pure class — no Convex imports — so unit
// tests cover it without a backend. The duplicate keeps planning facts only:
// who, when, where, guests, money seed and snapshots. Lifecycle identity
// (eventNumber, stage, import keys, archive flags, every stage timestamp) is
// never carried over; the generated Event_createViaPlanEngagement command
// starts the copy at the domain's fresh state.

export interface EventDuplicateSource {
  clientId?: string | null;
  clientName?: string | null;
  title?: string | null;
  eventType?: string | null;
  startsAt?: number | null;
  endsAt?: number | null;
  expectedHeadcount?: number | null;
  primaryContactName?: string | null;
  primaryContactEmail?: string | null;
  primaryContactPhone?: string | null;
  budgetAmount?: number | null;
  quotedPrice?: number | null;
  serviceStyleId?: string | null;
  serviceStyleName?: string | null;
  occasionId?: string | null;
  occasionName?: string | null;
  venueId?: string | null;
  venueName?: string | null;
  venueAddress?: string | null;
  venueCapacity?: number | null;
  accessibilityNeeds?: readonly string[] | null;
  serviceRequirements?: string | null;
  operationalRequirements?: string | null;
  assignedToId?: string | null;
  ownerName?: string | null;
  referralSourceId?: string | null;
}

export interface EventDuplicatePlanArgs {
  clientId: string;
  title: string;
  eventType: string;
  startsAt: number;
  endsAt: number;
  expectedHeadcount: number;
  primaryContactName: string;
  budgetAmount: number;
  quotedPrice: number;
  clientName?: string;
  serviceStyleId?: string;
  serviceStyleName?: string;
  occasionId?: string;
  occasionName?: string;
  venueId?: string;
  venueName?: string;
  venueAddress?: string;
  venueCapacity?: number;
  primaryContactEmail?: string;
  primaryContactPhone?: string;
  accessibilityNeeds?: string[];
  serviceRequirements?: string;
  operationalRequirements?: string;
  assignedToId?: string;
  ownerName?: string;
  referralSourceId?: string;
}

/** Pass a snapshot through only when it exists; null/undefined is omitted. */
function snapshot<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export class EventDuplicatePlanning {
  /** The copy's title: the trimmed source title plus a " (copy)" suffix. */
  static copyTitle(title: string): string {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("Event title is required");
    return `${trimmed} (copy)`;
  }

  static planArgs(source: EventDuplicateSource): EventDuplicatePlanArgs {
    if (!source.clientId) {
      throw new Error(
        "This event is missing a client, so it cannot be duplicated.",
      );
    }
    if (!source.eventType) {
      throw new Error(
        "This event is missing an event type, so it cannot be duplicated.",
      );
    }
    if (source.startsAt == null) {
      throw new Error(
        "This event is missing a start time, so it cannot be duplicated.",
      );
    }
    if (source.endsAt == null) {
      throw new Error(
        "This event is missing an end time, so it cannot be duplicated.",
      );
    }
    if (!source.primaryContactName) {
      throw new Error(
        "This event is missing a primary contact name, so it cannot be duplicated.",
      );
    }
    if (source.expectedHeadcount == null) {
      throw new Error(
        "This event is missing a guest count, so it cannot be duplicated.",
      );
    }
    // 0 is a real money seed: a duplicate starts unpaid and unquoted.
    // Snapshots that are null/undefined are omitted entirely, never sent
    // as undefined placeholders.
    const args: EventDuplicatePlanArgs = {
      clientId: source.clientId,
      title: this.copyTitle(source.title ?? ""),
      eventType: source.eventType,
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      expectedHeadcount: source.expectedHeadcount,
      primaryContactName: source.primaryContactName,
      budgetAmount: source.budgetAmount ?? 0,
      quotedPrice: source.quotedPrice ?? 0,
      clientName: snapshot(source.clientName),
      serviceStyleId: snapshot(source.serviceStyleId),
      serviceStyleName: snapshot(source.serviceStyleName),
      occasionId: snapshot(source.occasionId),
      occasionName: snapshot(source.occasionName),
      venueId: snapshot(source.venueId),
      venueName: snapshot(source.venueName),
      venueAddress: snapshot(source.venueAddress),
      venueCapacity: snapshot(source.venueCapacity),
      primaryContactEmail: snapshot(source.primaryContactEmail),
      primaryContactPhone: snapshot(source.primaryContactPhone),
      accessibilityNeeds: source.accessibilityNeeds?.length
        ? [...source.accessibilityNeeds]
        : undefined,
      serviceRequirements: snapshot(source.serviceRequirements),
      operationalRequirements: snapshot(source.operationalRequirements),
      assignedToId: snapshot(source.assignedToId),
      ownerName: snapshot(source.ownerName),
      referralSourceId: snapshot(source.referralSourceId),
    };
    return Object.fromEntries(
      Object.entries(args).filter(([, value]) => value !== undefined),
    ) as EventDuplicatePlanArgs;
  }
}
