import type { Doc, Id } from "../../lib/api";

export type EventPlanEngagementFormInput = {
  clientId: string;
  /** Selected client row — stamped as the snapshot. */
  client?: { name: string } | undefined;
  venueId: string;
  venue: Doc<"venues"> | undefined;
  title: string;
  eventTypeRaw: string;
  occasionId: string;
  /** Selected occasion row — stamped as the snapshot. */
  occasion?: { name: string } | undefined;
  serviceStyleId: string;
  /** Selected style row (or built-in catalog name) — stamped as the snapshot. */
  serviceStyle?: { name: string } | undefined;
  salespersonId: string;
  /** Selected salesperson row — stamped as the snapshot. */
  salesperson?: { name: string } | undefined;
  referralSourceId: string;
  startsAtRaw: string;
  endsAtRaw: string;
  expectedHeadcountRaw: FormDataEntryValue | null;
  primaryContactName: string;
  primaryContactEmail: string;
  primaryContactPhone: string;
  budgetAmountRaw: FormDataEntryValue | null;
  quotedPriceRaw: FormDataEntryValue | null;
  accessibilityNeedsRaw: string;
  serviceRequirements: string;
  operationalRequirements: string;
};

type ScheduleValues = {
  startsAt: number;
  endsAt: number;
  expectedHeadcount: number;
  budgetAmount: number;
  quotedPrice: number;
};

/** Builds a clean Event.planEngagement payload from the create-event form. */
export class EventPlanEngagementFormMapper {
  toCommandArgs(input: EventPlanEngagementFormInput): Record<string, unknown> {
    this.requireIds(input.clientId, input.venueId);
    const schedule = this.parseSchedule(input);
    const title = input.title.trim();
    // Event.planEngagement requires eventType — omitting it fails the command
    // schema, so the form collects it explicitly.
    const eventType = input.eventTypeRaw.trim();
    const primaryContactName = input.primaryContactName.trim();
    if (!title) throw new Error("Give this event a title.");
    if (!eventType) throw new Error("Pick what type of event this is.");
    if (!primaryContactName) {
      throw new Error("Give this event a primary contact name.");
    }

    const args: Record<string, unknown> = {
      clientId: input.clientId as Id<"clients">,
      venueId: input.venueId as Id<"venues">,
      title,
      eventType,
      startsAt: schedule.startsAt,
      endsAt: schedule.endsAt,
      expectedHeadcount: schedule.expectedHeadcount,
      primaryContactName,
      budgetAmount: schedule.budgetAmount,
      quotedPrice: schedule.quotedPrice,
    };
    // Snapshot the client printed name at booking so a later catalog edit
    // cannot rewrite the event's printed client (same as occasionName).
    const clientName = input.client?.name?.trim();
    if (clientName) args.clientName = clientName;
    this.assignOptionalOccasionField(args, input.occasionId, input.occasion);
    this.assignOptionalServiceStyleField(
      args,
      input.serviceStyleId,
      input.serviceStyle,
    );
    this.assignOptionalSalespersonField(
      args,
      input.salespersonId,
      input.salesperson,
    );
    this.assignOptionalReferralSourceField(args, input.referralSourceId);
    this.assignOptionalVenueFields(args, input.venue);
    this.assignOptionalContactFields(args, input);
    return args;
  }

  private requireIds(clientId: string, venueId: string): void {
    if (!clientId.trim()) {
      throw new Error("Select a client before creating the event.");
    }
    if (!venueId.trim()) {
      throw new Error("Select a venue before creating the event.");
    }
  }

  private parseSchedule(input: EventPlanEngagementFormInput): ScheduleValues {
    const startsAt = Date.parse(input.startsAtRaw);
    const endsAt = Date.parse(input.endsAtRaw);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) {
      throw new TypeError("Enter valid start and end dates.");
    }
    if (endsAt <= startsAt) {
      throw new Error("This event's end time has to be after its start time.");
    }

    const expectedHeadcount = Number(input.expectedHeadcountRaw);
    if (
      !Number.isFinite(expectedHeadcount) ||
      expectedHeadcount < 1 ||
      expectedHeadcount > 100000
    ) {
      throw new Error("Enter a headcount between 1 and 100,000.");
    }

    const budgetAmount = Number(input.budgetAmountRaw);
    const quotedPrice = Number(input.quotedPriceRaw);
    if (
      !Number.isFinite(budgetAmount) ||
      !Number.isFinite(quotedPrice) ||
      budgetAmount < 0 ||
      quotedPrice < 0
    ) {
      throw new Error(
        "Budget and quoted price can't be negative. Use zero or more.",
      );
    }

    return { startsAt, endsAt, expectedHeadcount, budgetAmount, quotedPrice };
  }

  private assignOptionalOccasionField(
    args: Record<string, unknown>,
    occasionId: string,
    occasion: { name: string } | undefined,
  ): void {
    const trimmed = occasionId.trim();
    if (trimmed) {
      args.occasionId = trimmed;
      // Snapshot the occasion name at booking so a later catalog rename cannot
      // rewrite the event's printed occasion (same as serviceStyleName).
      const occasionName = occasion?.name?.trim();
      if (occasionName) args.occasionName = occasionName;
    }
  }

  private assignOptionalServiceStyleField(
    args: Record<string, unknown>,
    serviceStyleId: string,
    serviceStyle: { name: string } | undefined,
  ): void {
    const trimmed = serviceStyleId.trim();
    if (trimmed) {
      args.serviceStyleId = trimmed;
      // Snapshot the style name at booking so a later catalog rename cannot
      // rewrite the event's printed service style (same as venueName).
      const serviceStyleName = serviceStyle?.name?.trim();
      if (serviceStyleName) args.serviceStyleName = serviceStyleName;
    }
  }

  // Salesperson maps to Event.assignedToId (the event owner/sales lead).
  private assignOptionalSalespersonField(
    args: Record<string, unknown>,
    salespersonId: string,
    salesperson: { name: string } | undefined,
  ): void {
    const trimmed = salespersonId.trim();
    if (trimmed) {
      args.assignedToId = trimmed;
      // Snapshot the owner printed name at booking so a later catalog rename
      // cannot rewrite the event's printed owner (same as occasionName).
      const ownerName = salesperson?.name?.trim();
      if (ownerName) args.ownerName = ownerName;
    }
  }

  private assignOptionalReferralSourceField(
    args: Record<string, unknown>,
    referralSourceId: string,
  ): void {
    const trimmed = referralSourceId.trim();
    if (trimmed) {
      args.referralSourceId = trimmed;
    }
  }

  private assignOptionalVenueFields(
    args: Record<string, unknown>,
    venue: Doc<"venues"> | undefined,
  ): void {
    const venueName = venue?.name?.trim();
    if (venueName) args.venueName = venueName;

    const address = this.venueAddress(venue);
    if (address) args.venueAddress = address;

    if (
      typeof venue?.capacity === "number" &&
      Number.isFinite(venue.capacity)
    ) {
      args.venueCapacity = venue.capacity;
    }
  }

  private assignOptionalContactFields(
    args: Record<string, unknown>,
    input: EventPlanEngagementFormInput,
  ): void {
    const email = input.primaryContactEmail.trim();
    if (email) args.primaryContactEmail = email;

    const phone = input.primaryContactPhone.trim();
    if (phone) args.primaryContactPhone = phone;

    const accessibilityNeeds = input.accessibilityNeedsRaw
      .split(/[,\n]/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (accessibilityNeeds.length) {
      args.accessibilityNeeds = accessibilityNeeds;
    }

    const serviceRequirements = input.serviceRequirements.trim();
    if (serviceRequirements) args.serviceRequirements = serviceRequirements;

    const operationalRequirements = input.operationalRequirements.trim();
    if (operationalRequirements) {
      args.operationalRequirements = operationalRequirements;
    }
  }

  private venueAddress(venue: Doc<"venues"> | undefined): string | undefined {
    if (!venue) return undefined;
    const joined = [
      venue.addressLine1,
      venue.addressLine2,
      venue.city,
      venue.region,
      venue.postalCode,
    ]
      .filter(Boolean)
      .join(", ");
    return joined || undefined;
  }
}

export const eventPlanEngagementFormMapper =
  new EventPlanEngagementFormMapper();
