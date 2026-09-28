// PL-PROPOSAL-DRAFT (AC-409/AC-417/AC-262/AC-261, spec §7.3): what the office
// needs to see on a proposal draft before it is sent - each section with the
// records it came from and whether the event changed since it was built, plus
// the missing material (no date, no venue, a venue not linked to a saved venue,
// a dish with no menu price, rentals not priced, no terms, no company name).
// Nothing here blocks sending; sending stays an explicit action.

import { query } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  parseGenerationRecord,
  staleSections,
  type DraftIssue,
  type SectionReport,
  type SourceRef,
} from "../../src/lib/proposalGeneration";
import { readEventSources, readProposalLines } from "./proposalGenerateSources";
import { resolveTenantBrandName } from "./proposalRevision";

export type ProposalDraftReport = {
  generated: boolean;
  eventId: string | null;
  /** The imported event's own number and import key stay readable. */
  legacy: { eventNumber: string | null; importSourceKey: string | null } | null;
  sections: SectionReport[];
  issues: DraftIssue[];
};

export const getProposalDraftReport = query({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, { proposalId }): Promise<ProposalDraftReport | null> => {
    // The generated read applies the sales read policy and the workspace.
    const proposal = await ctx.runQuery(api.queries.getProposal, { id: proposalId });
    if (!proposal) return null;
    const { rows, existing } = await readProposalLines(ctx, proposal);
    const liveLines = rows.filter((row) => row.deletedAt == null && row.removedAt == null);
    const record = parseGenerationRecord(proposal.generationJson);
    const issues: DraftIssue[] = [];
    const eventSources: SourceRef[] = [];
    const menuSources: SourceRef[] = [];
    let staleEvent: string[] = [];
    let staleMenu: string[] = [];
    let legacy: ProposalDraftReport["legacy"] = null;

    const eventRow = proposal.eventId ? await ctx.db.get(proposal.eventId) : null;
    const event =
      eventRow && eventRow.tenantId === proposal.tenantId && eventRow.deletedAt == null
        ? eventRow
        : null;
    if (event) {
      const read = await readEventSources(ctx, event);
      legacy = {
        eventNumber: event.eventNumber ?? null,
        importSourceKey: event.importSourceKey ?? null,
      };
      eventSources.push({ table: "events", id: String(event._id) });
      if (read.venue) eventSources.push({ table: "venues", id: String(read.venue._id) });
      for (const source of read.sources) menuSources.push(...source.sources);
      issues.push(...read.unpriced);
      if (read.facts.venueName && !read.venue) {
        issues.push({
          code: "venue_not_linked",
          message: `The venue "${read.facts.venueName}" is typed on the event but not linked to a saved venue, so its address and notes are not checked.`,
          recordIds: [String(event._id)],
        });
      }
      const rentals = event.eventRentals?.trim();
      if (rentals && !liveLines.some((line) => /rental/i.test(`${line.unit ?? ""} ${line.description}`))) {
        issues.push({
          code: "rentals_not_priced",
          message: `The event lists rentals (${rentals}) that have no price on this proposal. Add them as lines.`,
          recordIds: [String(event._id)],
        });
      }
      if (record) {
        const stale = staleSections({ record, facts: read.facts, sources: read.sources, existing });
        staleEvent = stale.event;
        staleMenu = stale.menu;
      }
    }

    if (proposal.eventDate == null) issues.push(issue("no_event_date", "This proposal has no event date.", proposalId));
    if (!proposal.venueName?.trim()) issues.push(issue("no_venue", "This proposal has no venue.", proposalId));
    if (!(proposal.guestCount > 0)) issues.push(issue("no_guest_count", "This proposal has no guest count.", proposalId));
    if (liveLines.length === 0) issues.push(issue("no_lines", "This proposal has no priced lines yet.", proposalId));
    if (!proposal.terms?.trim()) issues.push(issue("no_terms", "This proposal has no terms yet.", proposalId));
    if ((await resolveTenantBrandName(ctx, proposal.tenantId)) == null) {
      issues.push(
        issue(
          "no_company_name",
          "Your company name is not set, so the proposal cannot show who it is from. Add it in company settings.",
          proposalId,
        ),
      );
    }

    const lineSources = liveLines.map((line) => ({ table: "proposalLineItems", id: String(line._id) }));
    const sections: SectionReport[] = [
      { key: "event", sources: eventSources, stale: staleEvent.length > 0, staleReasons: staleEvent },
      { key: "menu", sources: menuSources, stale: staleMenu.length > 0, staleReasons: staleMenu },
      {
        key: "pricing",
        sources: [...lineSources, { table: "proposals", id: String(proposalId) }],
        stale: staleMenu.length > 0 || staleEvent.length > 0,
        staleReasons: staleMenu.length > 0 || staleEvent.length > 0
          ? ["The prices follow the menu and guest count; build again to bring them up to date."]
          : [],
      },
      { key: "terms", sources: [{ table: "proposals", id: String(proposalId) }], stale: false, staleReasons: [] },
    ];
    return {
      generated: record != null,
      eventId: proposal.eventId ? String(proposal.eventId) : null,
      legacy,
      sections,
      issues,
    };
  },
});

function issue(code: string, message: string, proposalId: Id<"proposals">): DraftIssue {
  return { code, message, recordIds: [String(proposalId)] };
}
