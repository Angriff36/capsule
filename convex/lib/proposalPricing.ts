// Proposal pricing recompute seam — spec §5.4 "one central calculation path".
//
// A draft proposal's priced lines (ProposalLineItem) can be added, revised, or
// removed after the initial draft. Each such edit changes the line set, so the
// parent Proposal totals (subtotal/total) AND every line's stored `amount`
// (percentage lines resolve against the base subtotal) must be (re)derived
// through the SAME central calc (src/lib/pricing.ts) the draft form, the
// published revision, and every read surface use. Without this seam, editing a
// line desynced the parent totals and left percentage lines stale — codex P1 #4
// — and reviseLine/removeLine stayed inert (no UI wired them).
//
// All amounts are computed AUTHORITATIVELY here (server-side), never caller-
// provisional: the generated line commands emit `amount` verbatim in their
// events, so a provisional/zero amount would publish false pricing to any event
// consumer. We compute the real amount before each write.
//
// Atomicity: each client-callable mutation runs the guarded generated line
// command(s) + the recompute as subtransactions of ONE transaction (Convex
// guideline: nested runMutation from a mutation = subtransactions; an uncaught
// throw rolls back the whole txn). So a line edit + its recompute commit
// atomically — a draft is never left with totals that don't match its lines,
// and `draftProposalWithLines` creates the proposal + ALL its lines atomically
// (the prior create flow did Proposal.draft then a sequential client-side line
// loop, so an interruption could leave stored totals for lines never persisted).
// Mirrors proposalRevision.ts (guarded runMutation + internal restamp).

import { internalMutation, mutation, query } from "../_generated/server";
import { api, internal } from "../_generated/api";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { computeProposalPricing, type PricingBasis } from "../../src/lib/pricing";
import { effectiveSellingPrice } from "../../src/lib/catalogEligibility";
import { getAuthContext } from "./authContext";

// Active, non-deleted priced lines for a proposal. JS loose-equality filter
// (governed-creation omits deletedAt at insert → fresh active rows have it
// ABSENT, not null; the Convex DSL `.eq("deletedAt", null)` would drop them).
// Matches proposalRevision.ts.
async function activeLines(
  ctx: { db: any },
  proposalId: Id<"proposals">,
): Promise<Doc<"proposalLineItems">[]> {
  return (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposalId))
      .collect()
  ).filter((row: any) => row.deletedAt == null);
}

// Resolve a catalog link's validated sellingPrice, or null if invalid (spec
// §5.4 L276; codex review findings 3/C). A valid link resolves to a SAME-TENANT,
// non-removed MenuDish (deletedAt null, addedAt set) that is priced, in a non-
// deleted PUBLISHED menu, whose Dish is active — the same conditions
// useCatalogDishes filters on, so UI and server agree. Non-throwing: the publish
// snapshot records null; enforcement callers throw on null.
export async function resolveCatalogPrice(
  ctx: { db: any },
  menuDishId: Id<"menuDishes"> | undefined | null,
  tenantId: string,
): Promise<number | null> {
  if (!menuDishId) return null;
  const menuDish = await ctx.db.get(menuDishId);
  if (
    !menuDish ||
    menuDish.deletedAt != null ||
    menuDish.addedAt == null ||
    menuDish.tenantId !== tenantId
  ) {
    return null;
  }
  // The price in force today — a dated price change applies from its day on.
  const price = effectiveSellingPrice(menuDish, Date.now());
  if (price == null) return null;
  const menu = await ctx.db.get(menuDish.menuId);
  if (!menu || menu.deletedAt != null || String(menu.status) !== "published") {
    return null;
  }
  const dish = await ctx.db.get(menuDish.dishId);
  if (!dish || String(dish.status) !== "active") return null;
  return price;
}

// Enforce a valid catalog link at write (throws on invalid). Thin throwing
// wrapper over resolveCatalogPrice; no-op for free-form lines (no menuDishId).
export async function assertValidCatalogLink(
  ctx: { db: any },
  menuDishId: Id<"menuDishes"> | undefined | null,
  tenantId: string,
): Promise<void> {
  if (
    menuDishId != null &&
    (await resolveCatalogPrice(ctx, menuDishId, tenantId)) == null
  ) {
    throw new Error(
      "Catalog dish link is invalid (missing, removed, foreign-tenant, unpriced, or not in an active published menu).",
    );
  }
}

// AC-547: a rental/decor line names a rentable item of the SAME company that is
// still in use (not removed, not retired). Null for anything else, so a foreign
// or retired item id never reaches a proposal.
export async function resolveRentalItem(
  ctx: { db: any },
  equipmentId: Id<"equipments"> | string | undefined | null,
  tenantId: string,
): Promise<{ name: string; ownership: string } | null> {
  if (!equipmentId) return null;
  const item = await ctx.db.get(equipmentId);
  if (
    !item ||
    item.deletedAt != null ||
    item.tenantId !== tenantId ||
    String(item.status) !== "active"
  ) {
    return null;
  }
  return { name: item.name, ownership: String(item.ownership) };
}

export async function assertValidRentalLink(
  ctx: { db: any },
  equipmentId: Id<"equipments"> | undefined | null,
  tenantId: string,
): Promise<void> {
  if (
    equipmentId != null &&
    (await resolveRentalItem(ctx, equipmentId, tenantId)) == null
  ) {
    throw new Error(
      "That rental item is not in your equipment list. Pick an item from the list.",
    );
  }
}

export interface RentalItemChoice {
  equipmentId: Id<"equipments">;
  name: string;
  category: string;
  ownership: string;
}

// AC-547: the rental/decor items a salesperson can put on a proposal line -
// name, kind and whether Mangia owns it or rents it in. Equipment itself is an
// inventory/logistics record, so this read gives staff of the same company
// only those facts - never value, condition or location.
export const listRentalItems = query({
  args: {},
  handler: async (ctx): Promise<RentalItemChoice[]> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId) return [];
    const items = await ctx.db
      .query("equipments")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", auth.tenantId))
      .collect();
    return items
      .filter((item) => item.deletedAt == null && item.status === "active")
      .map((item) => ({
        equipmentId: item._id,
        name: item.name,
        category: item.category,
        ownership: item.ownership,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

// Authoritative amount for ONE line against the proposal's active line set, so
// the emitted ProposalLineItem{Added,Revised} event carries the real amount.
// `target` is appended to the prospective set (and, for `revise`, the existing
// target row is excluded so its old value doesn't double-count); percentage
// lines resolve against the base subtotal of that set. discount/tax don't affect
// per-line amounts, so they're passed as 0 here. `recompute` later restamps
// every line's STORED amount; this makes the emitted EVENT correct.
async function authoritativeAmountForTarget(
  ctx: { db: any },
  proposalId: Id<"proposals">,
  guestCount: number,
  target: { pricingBasis: PricingBasis; unitPrice: number; quantity: number },
  mode: "add" | "revise",
  excludeLineId?: Id<"proposalLineItems">,
): Promise<number> {
  const existing = (await activeLines(ctx, proposalId)).filter(
    (row) => mode === "add" || String(row._id) !== String(excludeLineId),
  );
  const inputs = [
    ...existing.map((l) => ({
      pricingBasis: l.pricingBasis as PricingBasis,
      unitPrice: Number(l.unitPrice) || 0,
      quantity: Number(l.quantity) || 0,
    })),
    {
      pricingBasis: target.pricingBasis,
      unitPrice: target.unitPrice,
      quantity: target.quantity,
    },
  ];
  const result = computeProposalPricing({
    lines: inputs,
    guestCount,
    discountAmount: 0,
    taxAmount: 0,
  });
  // `target` is the last input → its resolved amount is the last line.
  return result.lines[result.lines.length - 1].amount;
}

// Restamp every active line's `amount` and the proposal's subtotal/total from
// the central calc. internalMutation → server-only (called after a guarded line
// op), so it does no auth check of its own; the wrapper's guarded runMutation
// already established salesAccess + draft status.
//
// tax/discount are operator fields (set on Proposal.draft), carried through
// unchanged; subtotal derives from the lines, and total = subtotal + tax -
// discount (the proposalTotalsConsistent invariant). All four values are 2dp, so
// the invariant holds exactly — the same arithmetic path the draft command uses.
export const recomputeProposalTotals = internalMutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    // Only draft proposals have editable lines (the line commands guard on
    // status=="draft"); recompute refuses otherwise.
    if (proposal.status !== "draft") {
      throw new Error("Proposal pricing can only be recomputed while draft");
    }
    const lines = await activeLines(ctx, args.proposalId);

    const result = computeProposalPricing({
      lines: lines.map((l) => ({
        pricingBasis: l.pricingBasis as PricingBasis,
        unitPrice: Number(l.unitPrice) || 0,
        quantity: Number(l.quantity) || 0,
      })),
      guestCount: Number(proposal.guestCount) || 0,
      discountAmount: Number(proposal.discountAmount) || 0,
      taxAmount: Number(proposal.taxAmount) || 0,
    });

    // Restamp each line's authoritative amount (positional —
    // computeProposalPricing preserves input order; percentage lines re-resolve
    // against the new base), then the parent totals.
    await Promise.all(
      lines.map((l, i) =>
        ctx.db.patch(l._id, { amount: result.lines[i].amount }),
      ),
    );
    await ctx.db.patch(args.proposalId, {
      subtotal: result.subtotal,
      total: result.total,
    });
  },
});

// Add a priced line to a draft proposal, then recompute. The line's amount is
// computed authoritatively against the active set (so the emitted
// ProposalLineItemAdded event is correct); recompute then restamps every line.
export const addProposalLineAndRecompute = mutation({
  args: {
    proposalId: v.id("proposals"),
    description: v.string(),
    pricingBasis: v.string(),
    unitPrice: v.number(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    menuDishId: v.optional(v.id("menuDishes")),
    overrideReason: v.optional(v.string()),
    equipmentId: v.optional(v.id("equipments")),
    // The event's travel & delivery fee line (convex/travelFees.ts).
    travelFee: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const proposal = await ctx.db.get(args.proposalId);
    // Tenant-check before any catalog read so a foreign proposal id yields only
    // "not found" (no existence / catalog-validation oracle). codex review A.
    if (!proposal || !auth.tenantId || proposal.tenantId !== auth.tenantId) {
      throw new Error("Proposal not found");
    }
    await assertValidCatalogLink(ctx, args.menuDishId, proposal.tenantId);
    await assertValidRentalLink(ctx, args.equipmentId, proposal.tenantId);
    const amount = await authoritativeAmountForTarget(
      ctx,
      args.proposalId,
      Number(proposal.guestCount) || 0,
      {
        pricingBasis: args.pricingBasis as PricingBasis,
        unitPrice: args.unitPrice,
        quantity: args.quantity ?? 0,
      },
      "add",
    );
    await ctx.runMutation(api.mutations.ProposalLineItem_createViaAddLine, {
      proposalId: args.proposalId,
      description: args.description,
      pricingBasis: args.pricingBasis,
      unitPrice: args.unitPrice,
      amount,
      quantity: args.quantity,
      unit: args.unit,
      sortOrder: args.sortOrder,
      notes: args.notes,
      menuDishId: args.menuDishId,
      overrideReason: args.overrideReason,
      equipmentId: args.equipmentId,
      travelFee: args.travelFee,
    });
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId: args.proposalId,
    });
  },
});

// Revise a draft proposal line, then recompute. proposalId is read from the
// line doc so the recompute always targets the line's own proposal; the revised
// amount is computed authoritatively (excluding the line's old value).
export const reviseProposalLineAndRecompute = mutation({
  args: {
    docId: v.id("proposalLineItems"),
    version: v.optional(v.number()),
    description: v.string(),
    pricingBasis: v.string(),
    unitPrice: v.number(),
    quantity: v.optional(v.number()),
    unit: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    notes: v.optional(v.string()),
    menuDishId: v.optional(v.id("menuDishes")),
    overrideReason: v.optional(v.string()),
    equipmentId: v.optional(v.id("equipments")),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const line = await ctx.db.get(args.docId);
    if (!line || !auth.tenantId || line.tenantId !== auth.tenantId) {
      throw new Error("Proposal line not found");
    }
    const proposal = await ctx.db.get(line.proposalId);
    if (!proposal) throw new Error("Proposal not found");
    await assertValidCatalogLink(ctx, args.menuDishId, proposal.tenantId);
    await assertValidRentalLink(ctx, args.equipmentId, proposal.tenantId);
    const amount = await authoritativeAmountForTarget(
      ctx,
      line.proposalId,
      Number(proposal.guestCount) || 0,
      {
        pricingBasis: args.pricingBasis as PricingBasis,
        unitPrice: args.unitPrice,
        quantity: args.quantity ?? 0,
      },
      "revise",
      args.docId,
    );
    await ctx.runMutation(api.mutations.ProposalLineItem_reviseLine, {
      docId: args.docId,
      version: args.version,
      description: args.description,
      pricingBasis: args.pricingBasis,
      unitPrice: args.unitPrice,
      amount,
      quantity: args.quantity,
      unit: args.unit,
      sortOrder: args.sortOrder,
      notes: args.notes,
      menuDishId: args.menuDishId,
      overrideReason: args.overrideReason,
      equipmentId: args.equipmentId,
    });
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId: line.proposalId,
    });
  },
});

// Remove a draft proposal line, then recompute. Reads proposalId before the
// soft-delete (removeLine sets deletedAt) so recompute targets the right
// proposal; recompute's active-line filter then excludes the removed row.
export const removeProposalLineAndRecompute = mutation({
  args: {
    docId: v.id("proposalLineItems"),
    version: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const auth = await getAuthContext(ctx);
    const line = await ctx.db.get(args.docId);
    if (!line || !auth.tenantId || line.tenantId !== auth.tenantId) {
      throw new Error("Proposal line not found");
    }
    await ctx.runMutation(api.mutations.ProposalLineItem_removeLine, {
      docId: args.docId,
      version: args.version,
    });
    await ctx.runMutation(internal.lib.proposalPricing.recomputeProposalTotals, {
      proposalId: line.proposalId,
    });
  },
});
