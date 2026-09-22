import type { Doc } from "../../lib/api";
import {
  formatCountNoun,
  formatDate,
  formatTime,
  toDatetimeLocalValue,
} from "../../lib/format";

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

export type ProposalCarryoverKey =
  | "title"
  | "type"
  | "date"
  | "times"
  | "headcount"
  | "venue"
  | "menuCount"
  | "enhancementCount";

export type ProposalCarryoverRow = {
  key: ProposalCarryoverKey;
  label: string;
  value: string;
  willCarry: boolean;
};

export type ProposalCarryoverPreview = {
  /** Always length 8, keys in the fixed order above. */
  rows: ProposalCarryoverRow[];
  willLink: boolean;
  linkReason: string;
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

  /**
   * What the operator will see carried over from the proposal before they
   * commit the create: the eight fields, whether each has a value to copy,
   * and whether linking will happen. Missing values read honestly.
   */
  carryoverPreview(input: {
    proposal: Doc<"proposals"> | null | undefined;
    menuCount: number;
    enhancementCount: number;
  }): ProposalCarryoverPreview {
    const { proposal, menuCount, enhancementCount } = input;
    const notSet = "Not on the proposal — set it on the event.";
    const title = proposal?.title?.trim() ?? "";
    const eventType = proposal?.eventType?.trim() ?? "";
    const venueName = proposal?.venueName?.trim() ?? "";
    const venueAddress = proposal?.venueAddress?.trim() ?? "";
    const guestCount = Number(proposal?.guestCount ?? 0);
    const start = proposal?.eventDate;
    const end = proposal?.eventEndDate;
    const hasStart = start != null && Number.isFinite(start);
    const hasEnd = end != null && Number.isFinite(end);
    const rows: ProposalCarryoverRow[] = [
      {
        key: "title",
        label: "Title",
        value: title || notSet,
        willCarry: title !== "",
      },
      {
        key: "type",
        label: "Type",
        value: eventType || notSet,
        willCarry: eventType !== "",
      },
      {
        key: "date",
        label: "Date",
        value: hasStart ? formatDate(start) : notSet,
        willCarry: hasStart,
      },
      {
        key: "times",
        label: "Times",
        value:
          hasStart || hasEnd
            ? `Start ${hasStart ? formatTime(start) : "not set"} · End ${hasEnd ? formatTime(end) : "not set"}`
            : notSet,
        willCarry: hasStart || hasEnd,
      },
      {
        key: "headcount",
        label: "Headcount",
        value: guestCount > 0 ? formatCountNoun(guestCount, "guest") : notSet,
        willCarry: guestCount > 0,
      },
      {
        key: "venue",
        label: "Venue",
        value: venueName
          ? venueAddress
            ? `${venueName} — ${venueAddress}`
            : venueName
          : notSet,
        willCarry: venueName !== "",
      },
      {
        key: "menuCount",
        label: "Menu",
        value:
          menuCount > 0
            ? formatCountNoun(menuCount, "menu selection")
            : "None to copy",
        willCarry: menuCount > 0,
      },
      {
        key: "enhancementCount",
        label: "Enhancements",
        value:
          enhancementCount > 0
            ? formatCountNoun(enhancementCount, "enhancement")
            : "None to copy",
        willCarry: enhancementCount > 0,
      },
    ];
    const willLink = this.canLinkOnCreate(proposal);
    const linkReason = (() => {
      if (proposal == null) {
        return "This proposal is missing — only an accepted proposal can be booked into an event.";
      }
      if (willLink) {
        return menuCount > 0
          ? `Creating this event links it to the proposal and copies its ${menuCount} menu selection${menuCount === 1 ? "" : "s"} onto the event.`
          : "Creating this event links it to the proposal. It has no menu selections to copy.";
      }
      if (proposal.eventId != null) {
        return "Already booked — this proposal is linked to an event.";
      }
      return `This proposal is ${String(proposal.status)} — only an accepted proposal can be booked into an event.`;
    })();
    return { rows, willLink, linkReason };
  }
}

export const proposalEventPrefill = new ProposalEventPrefill();
