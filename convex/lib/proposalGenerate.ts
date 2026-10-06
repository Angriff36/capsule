// PL-PROPOSAL-DRAFT (AC-416/AC-417/AC-431/AC-261, spec §7.2.6-7): ONE command
// that builds a proposal draft from an event, or refreshes the unsent draft it
// built before. A native event and an imported (TPP) event go through the same
// command. Replaying it with nothing changed writes nothing.
//
// It only calls GENERATED commands (Proposal draft / refreshFromEvent /
// followEventHeadcount, ProposalLineItem addLine / reviseLine / removeLine)
// under the caller's own sign-in, so the sales policies and draft guards apply,
// plus the central price restamp (proposalPricing.recomputeProposalTotals).
// No raw writes here (scripts/check-event-manifest-integration.ts).
//
// Staff work survives a rebuild: title, notes, terms, tax and discount are
// never touched; a generated line staff changed keeps their version; a line
// staff removed stays out; lines typed by hand are never touched.

import { mutation, type MutationCtx, type QueryCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";
import { getAuthContext, requireTenant } from "./authContext";
import {
  findGeneratedDraft,
  readEventSources,
  readProposalLines,
  readScopedEvent,
} from "./proposalGenerateSources";
import {
  parseGenerationRecord,
  planLines,
  sameFacts,
  type GeneratedLine,
  type GenerationRecord,
  type LineSource,
} from "../../src/lib/proposalGeneration";

export const generateProposalDraft = mutation({
  args: { eventId: v.id("events") },
  handler: async (
    ctx,
    { eventId },
  ): Promise<{
    proposalId: Id<"proposals">;
    created: boolean;
    changed: boolean;
    outcome: "created" | "updated" | "reused";
    version: number;
  }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const event = await readScopedEvent(ctx, tenantId, eventId);
    if (!event.clientId) {
      throw new Error("Add the client to this event before you build its proposal.");
    }
    const read = await readEventSources(ctx, event);

    let proposal = await findGeneratedDraft(ctx, event);
    const created = proposal == null;
    // A new draft starts from the template made for the event's service style,
    // the same pick the New proposal form makes.
    const template = created ? await templateForStyle(ctx, event) : null;
    if (!proposal) {
      const draft = await ctx.runMutation(api.mutations.Proposal_createViaDraft, {
        ...(template
          ? {
              terms: template.defaultTerms ?? undefined,
              notes: template.defaultNotes ?? undefined,
              visibleSections: template.visibleSections ?? undefined,
              sectionOrder: template.sectionOrder ?? undefined,
              expiresAt: Date.now() + (template.validityDays ?? 14) * 86_400_000,
            }
          : {}),
        clientId: event.clientId,
        title: event.title,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        guestCount: read.facts.guestCount,
        eventDate: read.facts.eventDate ?? undefined,
        eventEndDate: read.facts.eventEndDate ?? undefined,
        eventType: read.facts.eventType ?? undefined,
        venueName: read.facts.venueName ?? undefined,
        venueAddress: read.facts.venueAddress ?? undefined,
        eventId,
      });
      proposal = (await ctx.db.get(draft.docId as Id<"proposals">))!;
    }
    const proposalId = proposal._id;
    const prior = parseGenerationRecord(proposal.generationJson);
    const { rows, existing } = await readProposalLines(ctx, proposal);
    const plan = planLines(prior, read.sources, existing);
    const rowById = new Map(rows.map((row) => [String(row._id), row]));

    const lines: GeneratedLine[] = [...plan.carried];
    for (const kept of plan.kept) {
      const priorLine = prior!.lines.find((line) => line.lineId === kept.lineId)!;
      lines.push(priorLine);
    }
    for (const lineId of plan.remove) {
      await ctx.runMutation(api.mutations.ProposalLineItem_removeLine, {
        docId: lineId as Id<"proposalLineItems">,
      });
    }
    for (const { lineId, source } of plan.revise) {
      const row = rowById.get(lineId)!;
      await ctx.runMutation(api.mutations.ProposalLineItem_reviseLine, {
        docId: row._id,
        version: row.version,
        description: source.values.description,
        pricingBasis: source.values.pricingBasis,
        unitPrice: source.values.unitPrice,
        amount: amountOf(source),
        quantity: source.values.quantity,
        unit: row.unit ?? undefined,
        sortOrder: source.sortOrder,
        notes: row.notes ?? undefined,
        equipmentId: row.equipmentId ?? undefined,
        menuDishId: (source.values.menuDishId ?? undefined) as Id<"menuDishes"> | undefined,
      });
      lines.push(generated(source, lineId));
    }
    for (const source of plan.add) {
      const added = await ctx.runMutation(api.mutations.ProposalLineItem_createViaAddLine, {
        proposalId,
        description: source.values.description,
        pricingBasis: source.values.pricingBasis,
        unitPrice: source.values.unitPrice,
        amount: amountOf(source),
        quantity: source.values.quantity,
        sortOrder: source.sortOrder,
        menuDishId: (source.values.menuDishId ?? undefined) as Id<"menuDishes"> | undefined,
      });
      lines.push(generated(source, String(added.docId)));
    }
    if (created) await selectEventDishes(ctx, event, proposalId);
    // Only a new draft gets the template's service charge; a rebuild keeps
    // the one already there (or the one staff removed) as it is.
    const serviceRate = created ? Number(template?.defaultServiceChargePercent ?? 0) : 0;
    if (serviceRate > 0) {
      // Typed-by-hand line, so rebuilds leave it as staff set it.
      await ctx.runMutation(api.mutations.ProposalLineItem_createViaAddLine, {
        proposalId,
        description: "Service charge",
        pricingBasis: "percentage",
        unitPrice: Math.round(serviceRate * 10_000) / 100,
        amount: 0,
        quantity: 1,
        unit: "%",
        sortOrder: 10_000,
      });
    }
    const linesChanged =
      plan.add.length + plan.revise.length + plan.remove.length > 0 || serviceRate > 0;
    if (linesChanged) {
      await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
        proposalId,
      });
    }
    if (proposal.guestCount !== read.facts.guestCount) {
      await followGuestCount(ctx, proposalId, read.facts.guestCount);
    }

    const record: GenerationRecord = {
      v: 1,
      eventId: String(eventId),
      facts: read.facts,
      lines: lines.sort((a, b) => a.sourceKey.localeCompare(b.sourceKey)),
      excluded: plan.excluded,
    };
    const json = JSON.stringify(record);
    const headerCurrent = prior != null && sameFacts(headerFacts(proposal), read.facts);
    const changed = created || linesChanged || json !== proposal.generationJson || !headerCurrent;
    if (changed) {
      await ctx.runMutation(api.mutations.Proposal_refreshFromEvent, {
        docId: proposalId,
        generationJson: json,
        eventDate: read.facts.eventDate ?? undefined,
        eventEndDate: read.facts.eventEndDate ?? undefined,
        eventType: read.facts.eventType ?? undefined,
        venueName: read.facts.venueName ?? undefined,
        venueAddress: read.facts.venueAddress ?? undefined,
      });
    }
    const saved = await ctx.db.get(proposalId);
    return {
      proposalId,
      created,
      changed,
      outcome: created ? "created" : changed ? "updated" : "reused",
      version: saved?.version ?? 1,
    };
  },
});

/**
 * A new draft shows the client the event's dishes as its menu. Acceptance
 * matches these back onto the same event dishes, so nothing doubles.
 */
async function selectEventDishes(
  ctx: MutationCtx,
  event: Doc<"events">,
  proposalId: Id<"proposals">,
): Promise<void> {
  const rows = (
    await ctx.db
      .query("eventDishes")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()
  )
    .filter(
      (row) =>
        row.tenantId === event.tenantId &&
        row.deletedAt == null &&
        row.removedAt == null &&
        Number(row.quantityServings) > 0,
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a._creationTime - b._creationTime);
  for (const row of rows) {
    const dish = await ctx.db.get(row.dishId);
    if (!dish || dish.tenantId !== event.tenantId || dish.status !== "active") continue;
    let menuId: Id<"menus"> | null = null;
    for (const line of await ctx.db
      .query("menuDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", row.dishId))
      .collect()) {
      if (line.tenantId !== event.tenantId || line.deletedAt != null || line.removedAt != null) continue;
      const menu = await ctx.db.get(line.menuId);
      if (menu && menu.deletedAt == null && String(menu.status) === "published") {
        menuId = menu._id;
        break;
      }
    }
    if (!menuId) continue;
    await ctx.runMutation(api.mutations.ProposalDishSelection_createViaSelect, {
      proposalId,
      menuId,
      dishId: row.dishId,
      quantityServings: Math.trunc(Number(row.quantityServings)),
      course: row.course ?? undefined,
      serviceStyle: row.serviceStyle ?? undefined,
    });
  }
}

export async function templateForStyle(
  ctx: { db: QueryCtx["db"] },
  event: Doc<"events">,
): Promise<Doc<"proposalTemplates"> | null> {
  // The style's own template first; otherwise one made for any service style.
  const pick = async (styleId: Id<"serviceStyles"> | null) =>
    (
      await ctx.db
        .query("proposalTemplates")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", event.tenantId))
        .collect()
    )
      .filter(
        (row) =>
          row.deletedAt == null &&
          row.status === "active" &&
          (row.serviceStyleId ?? null) === styleId,
      )
      .sort((a, b) => a.name.localeCompare(b.name))[0] ?? null;
  return (
    (event.serviceStyleId ? await pick(event.serviceStyleId as Id<"serviceStyles">) : null) ??
    (await pick(null))
  );
}

function generated(source: LineSource, lineId: string): GeneratedLine {
  return { sourceKey: source.sourceKey, lineId, values: source.values, fingerprint: source.fingerprint };
}

/** Per-unit and flat lines price on their own; the restamp settles the rest. */
function amountOf(source: LineSource): number {
  return computeProposalPricing({
    lines: [
      {
        pricingBasis: source.values.pricingBasis as PricingBasis,
        unitPrice: source.values.unitPrice,
        quantity: source.values.quantity,
      },
    ],
    guestCount: 0,
    discountAmount: 0,
    taxAmount: 0,
  }).lines[0].amount;
}

function headerFacts(proposal: Doc<"proposals">) {
  return {
    eventDate: proposal.eventDate ?? null,
    eventEndDate: proposal.eventEndDate ?? null,
    eventType: proposal.eventType ?? null,
    venueName: proposal.venueName ?? null,
    venueAddress: proposal.venueAddress ?? null,
    guestCount: proposal.guestCount,
  };
}

/** Same step the headcount follow-through uses, priced by the central calc. */
export async function followGuestCount(
  ctx: MutationCtx,
  proposalId: Id<"proposals">,
  guestCount: number,
): Promise<void> {
  const row = (await ctx.db.get(proposalId))!;
  const lines = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
      .collect()
  ).filter((line) => line.deletedAt == null);
  let subtotal = Number(row.subtotal) || 0;
  let total = Number(row.total) || 0;
  if (lines.length > 0) {
    const priced = computeProposalPricing({
      lines: lines.map((line) => ({
        pricingBasis: line.pricingBasis as PricingBasis,
        unitPrice: Number(line.unitPrice) || 0,
        quantity: Number(line.quantity) || 0,
      })),
      guestCount,
      discountAmount: Number(row.discountAmount) || 0,
      taxAmount: Number(row.taxAmount) || 0,
    });
    subtotal = priced.subtotal;
    total = priced.total;
  }
  await ctx.runMutation(api.mutations.Proposal_followEventHeadcount, {
    docId: proposalId,
    version: row.version,
    guestCount,
    subtotal,
    total,
  });
  if (lines.length > 0) {
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId,
    });
  }
}
