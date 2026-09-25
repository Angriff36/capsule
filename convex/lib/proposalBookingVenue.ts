// Venue identity for canonical booking (PL-BOOKING AC-410). The proposal
// stores a venue NAME only; when the booking caller omits `event.venueId`,
// resolve it against this tenant's saved venues: a UNIQUE live name match is
// attached, an AMBIGUOUS name refuses to book (never a silent first match —
// same rule the create form already applies via
// src/features/events/ProposalEventPrefill.matchVenue), and zero matches
// books with the caller's text so the mismatch stays visible.
export type BookingVenueRow = {
  _id: string;
  tenantId: string;
  name: string;
  capacity: number;
  status: string;
  deletedAt?: number | null;
};

export type BookingVenueDecision =
  | { kind: "picked"; venue: BookingVenueRow }
  | { kind: "unique"; venue: BookingVenueRow }
  | { kind: "none" };

export interface BookingVenueDecideInput {
  tenantId: string;
  proposalVenueName?: string | null;
  requestedVenueId?: string | null;
  venues: readonly BookingVenueRow[];
}

export class ProposalBookingVenue {
  /** Trim + case-insensitive venue-name rule (same as the create form). */
  normalizeName(name: string | null | undefined): string {
    return name?.trim().toLowerCase() ?? "";
  }

  /** Live tenant venues whose name matches `wanted` (already normalized). */
  liveMatches(
    venues: readonly BookingVenueRow[],
    wanted: string,
  ): BookingVenueRow[] {
    return venues.filter(
      (venue) => this.normalizeName(venue.name) === wanted,
    );
  }

  /**
   * Throws when the name is ambiguous and no venueId was picked.
   * Throws when a picked id is missing, deleted, or not in this tenant.
   */
  decide(input: BookingVenueDecideInput): BookingVenueDecision {
    const live = input.venues.filter(
      (venue) =>
        venue.tenantId === input.tenantId &&
        venue.deletedAt == null &&
        venue.status === "active",
    );

    if (typeof input.requestedVenueId === "string" && input.requestedVenueId !== "") {
      const venue = live.find(
        (row) => String(row._id) === String(input.requestedVenueId),
      );
      if (!venue) throw new Error("Venue not found");
      return { kind: "picked", venue };
    }

    const wanted = this.normalizeName(input.proposalVenueName);
    if (!wanted) return { kind: "none" };

    const matches = this.liveMatches(live, wanted);
    if (matches.length > 1) {
      throw new Error(
        "Several saved venues share this name. Pick one before booking.",
      );
    }
    if (matches.length === 1) return { kind: "unique", venue: matches[0] };
    return { kind: "none" };
  }
}

export const proposalBookingVenue = new ProposalBookingVenue();
