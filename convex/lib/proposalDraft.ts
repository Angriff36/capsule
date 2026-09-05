// Atomic proposal-with-lines creation — spec §5.4 (single calc path) + §5.1.
//
// Lives in its own module (not proposalPricing.ts) so the event-manifest
// integration guard is unambiguous: this module ONLY calls GENERATED commands
// (Proposal_createViaDraft, ProposalLineItem_createViaAddLine) — it never raw-
// patches a document. The guard flags any authored convex/lib module that BOTH
// raw-writes AND references Client/Venue/Event/EventGuest; draftProposalWithLines
// references clients/events (its args) but writes nothing directly, so it must
// not share a file with the recompute seam (which does raw-patch line items +
// proposal totals). See scripts/check-event-manifest-integration.ts.
//
// Creates a draft proposal AND all its priced lines in ONE transaction: the
// central calc derives authoritative totals + every line amount up front, so an
// interruption can never leave stored totals for lines that were never persisted
// (codex review #3 on the prior Proposal.draft + sequential client-side loop).

import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";
import { getAuthContext, requireTenant } from "./authContext";
import { assertValidCatalogLink } from "./proposalPricing";

export const draftProposalWithLines = mutation({
  args: {
    clientId: v.id("clients"),
    title: v.string(),
    guestCount: v.optional(v.number()),
    // Provisional totals (the central calc overwrites the authoritative values
    // below); kept in the signature so the arg validator matches Proposal.draft.
    subtotal: v.number(),
    taxAmount: v.number(),
    discountAmount: v.number(),
    total: v.number(),
    eventDate: v.optional(v.number()),
    eventEndDate: v.optional(v.number()),
    eventType: v.optional(v.string()),
    venueName: v.optional(v.string()),
    venueAddress: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    terms: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
    lines: v.array(
      v.object({
        description: v.string(),
        pricingBasis: v.string(),
        unitPrice: v.number(),
        quantity: v.optional(v.number()),
        unit: v.optional(v.string()),
        menuDishId: v.optional(v.id("menuDishes")),
        overrideReason: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<void> => {
    // The created proposal's tenant is the caller's tenant (TenantScoped
    // creation sources tenantId from auth). Validate every catalog link against
    // it up front (codex review finding 3) — same-tenant published priced dish.
    const tenantId = requireTenant(await getAuthContext(ctx));
    const pricing = computeProposalPricing({
      lines: args.lines.map((l) => ({
        pricingBasis: l.pricingBasis as PricingBasis,
        unitPrice: l.unitPrice,
        quantity: l.quantity ?? 0,
      })),
      guestCount: args.guestCount ?? 0,
      discountAmount: args.discountAmount,
      taxAmount: args.taxAmount,
    });

    const created = await ctx.runMutation(api.mutations.Proposal_createViaDraft, {
      clientId: args.clientId,
      title: args.title,
      subtotal: pricing.subtotal,
      taxAmount: pricing.taxAmount,
      discountAmount: pricing.discountAmount,
      total: pricing.total,
      guestCount: args.guestCount,
      eventDate: args.eventDate,
      eventEndDate: args.eventEndDate,
      eventType: args.eventType,
      venueName: args.venueName,
      venueAddress: args.venueAddress,
      expiresAt: args.expiresAt,
      notes: args.notes,
      terms: args.terms,
      eventId: args.eventId,
    });
    const proposalId = created.docId as Id<"proposals">;

    // Persist every line with its authoritative amount (positional). One
    // transaction → all-or-nothing with the proposal create above.
    for (let i = 0; i < args.lines.length; i++) {
      const line = args.lines[i];
      await assertValidCatalogLink(ctx, line.menuDishId, tenantId);
      await ctx.runMutation(api.mutations.ProposalLineItem_createViaAddLine, {
        proposalId,
        description: line.description,
        pricingBasis: line.pricingBasis,
        unitPrice: line.unitPrice,
        amount: pricing.lines[i].amount,
        quantity: line.quantity,
        unit: line.unit,
        sortOrder: i,
        menuDishId: line.menuDishId,
        overrideReason: line.overrideReason,
      });
    }
    // No return: an untyped `any` return here would cascade through the `api`
    // composite and re-introduce the app-wide TS7006 cascade (the quoteBuilder/
    // proposalRevision lesson). The proposal list is reactive; the UI needs no
    // created-id back.
  },
});
