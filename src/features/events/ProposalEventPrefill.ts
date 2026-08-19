import type { Doc } from "../../lib/api";

/** Default form values the create-event form seeds from an accepted proposal. */
export type ProposalPrefillValues = {
  title?: string;
  eventType?: string;
  /** Proposal event date in the datetime-local input format. */
  startsAtLocal?: string;
  expectedHeadcount?: number;
  quotedPrice?: number;
};

/**
 * Maps an accepted Proposal onto the create-event form (issue #141): field
 * defaults, venue matching, and whether creating the event should link back
 * to the proposal and copy its menu (via convex/lib/proposalEventCreation).
 */
export class ProposalEventPrefill {
  values(proposal: Doc<"proposals"> | null | undefined): ProposalPrefillValues {
    if (!proposal) return {};
    const guestCount = Number(proposal.guestCount ?? 0);
    const total = Number(proposal.total ?? 0);
    return {
      title: proposal.title || undefined,
      eventType: proposal.eventType ?? undefined,
      startsAtLocal: this.toDatetimeLocal(proposal.eventDate),
      expectedHeadcount: guestCount > 0 ? guestCount : undefined,
      quotedPrice: total > 0 ? total : undefined,
    };
  }

  /** The proposal only stores a venue NAME — resolve it against real venues. */
  matchVenue(
    proposal: Doc<"proposals"> | null | undefined,
    venues: readonly Doc<"venues">[],
  ): Doc<"venues"> | undefined {
    const wanted = proposal?.venueName?.trim().toLowerCase();
    if (!wanted) return undefined;
    return venues.find((venue) => venue.name.trim().toLowerCase() === wanted);
  }

  /**
   * True when creating the event should also link the proposal and copy its
   * menu selections: accepted, live, and not already booked into an event.
   */
  canLinkOnCreate(proposal: Doc<"proposals"> | null | undefined): boolean {
    return (
      proposal != null &&
      proposal.deletedAt == null &&
      String(proposal.status) === "accepted" &&
      proposal.eventId == null
    );
  }

  private toDatetimeLocal(
    timestamp: number | null | undefined,
  ): string | undefined {
    if (timestamp == null || !Number.isFinite(timestamp)) return undefined;
    const date = new Date(timestamp);
    const pad = (part: number) => String(part).padStart(2, "0");
    return (
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
      `T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  }
}

export const proposalEventPrefill = new ProposalEventPrefill();
