// PL-PROPOSAL-DRAFT (AC-409/AC-417/AC-262/AC-261, spec §7.3): what the office
// needs to see on a proposal draft before it is sent - each section with the
// records it came from and whether the event changed since it was built, plus
// the missing material (no date, no venue, a venue not linked to a saved venue,
// a dish with no menu price, rentals not priced, no terms, no company name).
// Nothing here blocks sending; sending stays an explicit action.

import { query, type QueryCtx } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { equipmentBlock, equipmentConflicts } from "./equipmentReservationAvailability";
import { resolveCatalogPrice } from "./proposalPricing";
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
    const venueSources: SourceRef[] = [];
    const serviceSources: SourceRef[] = [];
    const rentalSources: SourceRef[] = [];
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
      // Venue, service style and rentals each name the records they show.
      if (read.venue) venueSources.push({ table: "venues", id: String(read.venue._id) });
      if (event.venueName?.trim() || event.venueAddress?.trim())
        venueSources.push({ table: "events", id: String(event._id) });
      const style = event.serviceStyleId ? await ctx.db.get(event.serviceStyleId) : null;
      if (style && style.tenantId === event.tenantId && style.deletedAt == null)
        serviceSources.push({ table: "serviceStyles", id: String(style._id) });
      for (const table of ["equipmentReservations", "rentalOrderLines"] as const) {
        const held = await ctx.db
          .query(table)
          .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
          .collect();
        for (const row of held)
          if (row.tenantId === event.tenantId && row.deletedAt == null && row.status !== "cancelled")
            rentalSources.push({ table, id: String(row._id) });
      }
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

    issues.push(...(await availabilityIssues(ctx, proposal, liveLines, event)));

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
    if (venueSources.length === 0 && proposal.venueName?.trim())
      venueSources.push({ table: "proposals", id: String(proposalId) });
    for (const line of liveLines)
      if (line.equipmentId)
        rentalSources.push({ table: "proposalLineItems", id: String(line._id) });
    for (const [key, sources] of [
      ["venue", venueSources],
      ["service", serviceSources],
      ["rentals", rentalSources],
    ] as const)
      if (sources.length > 0)
        sections.push({ key, sources: [...sources], stale: false, staleReasons: [] });
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

const DAY_MS = 24 * 60 * 60 * 1000;
const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * PL-ASSET-AVAILABILITY / BE-7.2-09 (AC-419): before the proposal goes out,
 * each rental line is checked against the equipment list for the event window
 * and each menu line against the published menus, where Capsule knows enough.
 * A conflict is an issue on that one line - the line stays on the proposal
 * (never silently dropped) and sending is not blocked: the office can rent
 * the rest from a vendor or change the amount.
 */
async function availabilityIssues(
  ctx: QueryCtx,
  proposal: Doc<"proposals">,
  lines: Doc<"proposalLineItems">[],
  event: Doc<"events"> | null,
): Promise<DraftIssue[]> {
  const issues: DraftIssue[] = [];
  const startsAt = event?.startsAt ?? proposal.eventDate ?? null;
  const endsAt =
    event?.endsAt ?? proposal.eventEndDate ?? (startsAt != null ? startsAt + DAY_MS : null);
  for (const line of lines) {
    const lineId = [String(line._id)];
    const menuDishId = line.menuDishId ? ctx.db.normalizeId("menuDishes", line.menuDishId) : null;
    if (line.menuDishId && (!menuDishId || (await resolveCatalogPrice(ctx, menuDishId, proposal.tenantId)) == null)) {
      issues.push({
        code: "menu_item_unavailable",
        message: `"${line.description}" is no longer on a published menu. Pick another dish or remove the menu link.`,
        recordIds: lineId,
      });
    }
    if (!line.equipmentId) continue;
    const equipmentId = ctx.db.normalizeId("equipments", line.equipmentId);
    const item = equipmentId ? await ctx.db.get(equipmentId) : null;
    if (!item || item.tenantId !== proposal.tenantId || item.deletedAt != null || item.status !== "active") {
      issues.push({
        code: "rental_unavailable",
        message: `"${line.description}" is no longer in your equipment list. Pick another item or rent it from a vendor.`,
        recordIds: lineId,
      });
      continue;
    }
    if (equipmentBlock(item) === "out_of_service") {
      issues.push({
        code: "rental_unavailable",
        message: `${item.name} is marked out of service. Rent it from a vendor, pick another item, or mark it back in service once it is fixed.`,
        recordIds: lineId,
      });
      continue;
    }
    if (startsAt == null || endsAt == null || endsAt <= startsAt) continue;
    const wanted = Number(line.quantity) > 0 ? Number(line.quantity) : 1;
    const holds = await ctx.db
      .query("equipmentReservations")
      .withIndex("by_equipmentId", (q) => q.eq("equipmentId", item._id))
      .collect();
    const window = {
      tenantId: proposal.tenantId,
      startsAt,
      endsAt,
      now: Date.now(),
      ...(proposal.eventId ? { excludeEventId: String(proposal.eventId) } : {}),
    };
    const conflicts = equipmentConflicts(holds, window);
    const free = Math.max(0, item.quantity - conflicts.reduce((sum, row) => sum + row.quantity, 0));
    if (wanted <= free) continue;
    const booked: string[] = [];
    for (const conflict of conflicts) {
      const other = await ctx.db.get(conflict.eventId as Id<"events">);
      booked.push(`${other && other.tenantId === proposal.tenantId ? other.title : "another event"} (${conflict.quantity})`);
    }
    issues.push({
      code: "rental_unavailable",
      message: `${item.name}: ${free} free on ${day.format(startsAt)}, this proposal asks for ${wanted}.${
        booked.length ? ` Already booked by ${booked.join(", ")}.` : ""
      } Rent the rest from a vendor or change the amount.`,
      recordIds: lineId,
    });
  }
  return issues;
}
