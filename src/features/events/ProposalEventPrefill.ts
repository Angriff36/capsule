import type { Doc } from "../../lib/api";
import { toDatetimeLocalValue } from "../../lib/format";

/** Default form values the create-event form seeds from an accepted proposal. */
export type ProposalPrefillValues = {
  title?: string;
  eventType?: string;
  /** Proposal event date in the datetime-local input format. */
  startsAtLocal?: string;
  /** Proposal event end (C2) in the datetime-local input format. */
  endsAtLocal?: string;
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
    // The lib helper needs a finite number; proposal fields are nullable.
    const localDatetime = (
      ms: number | null | undefined,
    ): string | undefined =>
      ms != null && Number.isFinite(ms) ? toDatetimeLocalValue(ms) : undefined;
    return {
      title: proposal.title || undefined,
      eventType: proposal.eventType ?? undefined,
      startsAtLocal: localDatetime(proposal.eventDate),
      endsAtLocal: localDatetime(proposal.eventEndDate),
      expectedHeadcount: guestCount > 0 ? guestCount : undefined,
      quotedPrice: total > 0 ? total : undefined,
    };
  }

  /**
   * Every saved venue whose name matches the proposal's venue NAME (case and
   * whitespace-insensitive).
   */
  venueMatches(
    proposal: Doc<"proposals"> | null | undefined,
    venues: readonly Doc<"venues">[],
  ): Doc<"venues">[] {
    const wanted = proposal?.venueName?.trim().toLowerCase();
    if (!wanted) return [];
    return venues.filter((venue) => venue.name.trim().toLowerCase() === wanted);
  }

  /**
   * The proposal only stores a venue NAME — resolve it against real venues.
   * Auto-select only a UNIQUE match (issue #393): when several saved venues
   * share the name, silently booking the first could attach the wrong
   * identity, so the choice stays with the operator.
   */
  matchVenue(
    proposal: Doc<"proposals"> | null | undefined,
    venues: readonly Doc<"venues">[],
  ): Doc<"venues"> | undefined {
    const matches = this.venueMatches(proposal, venues);
    return matches.length === 1 ? matches[0] : undefined;
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
}

export const proposalEventPrefill = new ProposalEventPrefill();
