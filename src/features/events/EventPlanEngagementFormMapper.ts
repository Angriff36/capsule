import type { Doc, Id } from "../../lib/api";

export type EventPlanEngagementFormInput = {
  clientId: string;
  venueId: string;
  venue: Doc<"venues"> | undefined;
  title: string;
  eventTypeRaw: string;
  occasionId: string;
  serviceStyleId: string;
  salespersonId: string;
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
    if (!title) throw new Error("Event title is required.");
    if (!eventType) throw new Error("Event type is required.");
    if (!primaryContactName) {
      throw new Error("Primary contact name is required.");
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
    this.assignOptionalOccasionField(args, input.occasionId);
    this.assignOptionalServiceStyleField(args, input.serviceStyleId);
    this.assignOptionalSalespersonField(args, input.salespersonId);
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
      throw new TypeError("Start and end must be valid dates.");
    }
    if (endsAt <= startsAt) {
      throw new Error("Event end must be after its start.");
    }

    const expectedHeadcount = Number(input.expectedHeadcountRaw);
    if (
      !Number.isFinite(expectedHeadcount) ||
      expectedHeadcount < 1 ||
      expectedHeadcount > 100000
    ) {
      throw new Error("Headcount must be a number between 1 and 100000.");
    }

    const budgetAmount = Number(input.budgetAmountRaw);
    const quotedPrice = Number(input.quotedPriceRaw);
    if (
      !Number.isFinite(budgetAmount) ||
      !Number.isFinite(quotedPrice) ||
      budgetAmount < 0 ||
      quotedPrice < 0
    ) {
      throw new Error("Budget and quoted price must be zero or greater.");
    }

    return { startsAt, endsAt, expectedHeadcount, budgetAmount, quotedPrice };
  }

  private assignOptionalOccasionField(
    args: Record<string, unknown>,
    occasionId: string,
  ): void {
    const trimmed = occasionId.trim();
    if (trimmed) {
      args.occasionId = trimmed;
    }
  }

  private assignOptionalServiceStyleField(
    args: Record<string, unknown>,
    serviceStyleId: string,
  ): void {
    const trimmed = serviceStyleId.trim();
    if (trimmed) {
      args.serviceStyleId = trimmed;
    }
  }

  // Salesperson maps to Event.assignedToId (the event owner/sales lead).
  private assignOptionalSalespersonField(
    args: Record<string, unknown>,
    salespersonId: string,
  ): void {
    const trimmed = salespersonId.trim();
    if (trimmed) {
      args.assignedToId = trimmed;
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
