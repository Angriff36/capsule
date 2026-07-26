// Proposal Revision Capture - Authored seam for proposal revision snapshotting

import { internalMutation, mutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";

// 2dp rounding for comparing stored money(12,2) values (float-stable).
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Snapshot data structure for proposal revisions
export interface ProposalRevisionSnapshot {
  proposal: {
    id: string;
    proposalNumber: string | null;
    title: string;
    eventDate: number | null;
    eventType: string | null;
    guestCount: number;
    venueName: string | null;
    venueAddress: string | null;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
    expiresAt: number | null;
    notes: string | null;
    terms: string | null;
    status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "superseded";
    draftedAt: number | null;
    sentAt: number | null;
  };
  client: {
    id: string;
    name: string;
  };
  dishSelections: Array<{
    id: string;
    menuId: string;
    menuName: string;
    dishId: string;
    dishName: string;
    dishDescription: string | null;
    quantityServings: number;
    course: string | null;
    serviceStyle: string | null;
    specialInstructions: string | null;
    selectedAt: number | null;
  }>;
  // Priced lines (spec §5.4) captured at publication so an accepted revision
  // stays reproducible after later catalog/menu edits. `amount` is the central
  // calc output stored on each line; the snapshot copies it verbatim.
  // Catalog-sourced lines (spec §5.4 L276) also snapshot the linked MenuDish's
  // `sellingPrice` as `catalogPrice` plus the `overrideReason`, so a price
  // override stays auditable in the immutable revision even after the catalog
  // price later changes.
  lineItems: Array<{
    id: string;
    description: string;
    pricingBasis: string;
    unitPrice: number;
    quantity: number;
    unit: string | null;
    amount: number;
    sortOrder: number;
    notes: string | null;
    menuDishId: string | null;
    catalogPrice: number | null;
    overrideReason: string | null;
  }>;
  tenant: {
    name: string;
  };
}

// Build proposal revision snapshot from live proposal data
export async function buildProposalRevisionSnapshot(
  ctx: { db: any; auth: any },
  proposal: Doc<"proposals">
): Promise<string> {
  // Get client for name snapshot
  const client = await ctx.db.get(proposal.clientId);
  if (!client) {
    throw new Error("Client not found for proposal revision snapshot");
  }

  // Get dish selections for this proposal. JS loose-equality filter (not the
  // Convex DSL .eq): governed-creation omits deletedAt at insert, so fresh
  // active rows have it ABSENT (undefined), and `.eq("deletedAt", null)` would
  // drop every fresh selection → an empty dish snapshot. Same fix as the
  // lineItems query below and the existingRevisions lookup in captureProposalRevision.
  const dishSelections = (
    await ctx.db
      .query("proposalDishSelections")
      .withIndex("by_proposalId", (q: any) => q.eq(proposal._id))
      .collect()
  ).filter((row: any) => row.deletedAt == null);

  // Resolve dish names and menu names for each selection
  const dishSelectionsData = await Promise.all(
    dishSelections.map(async (selection: any) => {
      const dish = await ctx.db.get(selection.dishId);
      const menu = await ctx.db.get(selection.menuId);
      return {
        id: selection._id.toString(),
        menuId: selection.menuId.toString(),
        menuName: menu?.name ?? "Unknown Menu",
        dishId: selection.dishId.toString(),
        dishName: dish?.name ?? "Unknown Dish",
        dishDescription: dish?.description ?? null,
        quantityServings: selection.quantityServings,
        course: selection.course ?? null,
        serviceStyle: selection.serviceStyle ?? null,
        specialInstructions: selection.specialInstructions ?? null,
        selectedAt: selection.selectedAt ?? null,
      };
    })
  );

  // Get tenant name (from auth context or tenant record)
  // For now, use a placeholder - this would come from tenant entity in production
  const tenantName = "Tenant"; // TODO: Resolve from tenant entity

  // Get priced line items (spec §5.4) — effective prices snapshotted here.
  // JS loose-equality filter (not the Convex DSL .eq) because governed-creation
  // omits deletedAt at insert, so fresh active rows have it ABSENT (undefined),
  // and the DSL `.eq("deletedAt", null)` would miss them. Matches the working
  // pattern in convex/queries.ts listProposalLineItemByTenantId.
  const lineItems = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q: any) => q.eq(proposal._id))
      .collect()
  ).filter((row: any) => row.deletedAt == null);
  const lineItemsData = (
    await Promise.all(
      lineItems.map(async (line: any) => {
        // Resolve the linked catalog price (spec §5.4 L276 audit) so the
        // snapshot records what the dish sold for at publication, independent
        // of later MenuDish.sellingPrice edits. Only a SAME-TENANT dish's price
        // is snapshotted — a foreign / missing / unpriced link carries no
        // catalogPrice (no foreign-price leak into the immutable revision).
        const menuDish = line.menuDishId ? await ctx.db.get(line.menuDishId) : null;
        const sameTenantPriced =
          !!menuDish &&
          menuDish.tenantId === proposal.tenantId &&
          menuDish.sellingPrice != null;
        return {
          id: line._id.toString(),
          description: line.description,
          pricingBasis: line.pricingBasis,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          unit: line.unit ?? null,
          amount: line.amount,
          sortOrder: line.sortOrder,
          notes: line.notes ?? null,
          menuDishId: line.menuDishId ? line.menuDishId.toString() : null,
          catalogPrice: sameTenantPriced ? Number(menuDish.sellingPrice) : null,
          overrideReason: line.overrideReason ?? null,
        };
      }),
    )
  ).sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const snapshot: ProposalRevisionSnapshot = {
    proposal: {
      id: proposal._id.toString(),
      proposalNumber: proposal.proposalNumber ?? null,
      title: proposal.title,
      eventDate: proposal.eventDate ?? null,
      eventType: proposal.eventType ?? null,
      guestCount: proposal.guestCount,
      venueName: proposal.venueName ?? null,
      venueAddress: proposal.venueAddress ?? null,
      subtotal: proposal.subtotal,
      taxAmount: proposal.taxAmount,
      discountAmount: proposal.discountAmount,
      total: proposal.total,
      expiresAt: proposal.expiresAt ?? null,
      notes: proposal.notes ?? null,
      terms: proposal.terms ?? null,
      status: proposal.status,
      draftedAt: proposal.draftedAt ?? null,
      sentAt: proposal.sentAt ?? null,
    },
    client: {
      id: client._id.toString(),
      name: client.clientType === "company" ? (client.companyName ?? "Unknown Company") : `${client.givenName ?? ""} ${client.familyName ?? ""}`.trim() || "Unknown Client",
    },
    dishSelections: dishSelectionsData,
    lineItems: lineItemsData,
    tenant: {
      name: tenantName,
    },
  };

  return JSON.stringify(snapshot);
}

// Capture a proposal revision (internal mutation, called after proposal send)
export const captureProposalRevision = internalMutation({
  args: {
    proposalId: v.id("proposals"),
    changeSummary: v.string(),
  },
  handler: async (ctx, args) => {
    const { proposalId, changeSummary } = args;

    // Get the proposal
    const proposal = await ctx.db.get(proposalId);
    if (!proposal) {
      throw new Error("Proposal not found");
    }

    // Get existing revisions to determine next revision number. JS loose-equality
    // filter (not the Convex DSL .eq): revisions are inserted WITHOUT deletedAt
    // (optional, omitted at insert), so the DSL `.eq("deletedAt", null)` would
    // miss every fresh active revision → nextRevisionNumber would always restart
    // at 1 → collision. Same fix as the lineItems query in the snapshot builder.
    const existingRevisions = (
      await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposalId", (q: any) => q.eq(proposalId))
        .collect()
    ).filter((row: any) => row.deletedAt == null);

    let nextRevisionNumber = 1;
    if (existingRevisions.length > 0) {
      const maxRevision = existingRevisions.reduce(
        (max, rev) => (rev.revisionNumber > max ? rev.revisionNumber : max),
        0
      );
      nextRevisionNumber = maxRevision + 1;
    }

    // Build the snapshot
    const snapshot = await buildProposalRevisionSnapshot(ctx, proposal);

    // Get capturedBy identity from auth context
    const identity = await ctx.auth.getUserIdentity();
    const capturedByName = identity?.name ?? "Unknown";

    // Create the revision record
    const revisionId = await ctx.db.insert("proposalRevisions", {
      tenantId: proposal.tenantId,
      proposalId: proposal._id,
      revisionNumber: nextRevisionNumber,
      changeSummary: changeSummary || "Proposal sent to client",
      capturedByName: capturedByName,
      capturedByAuthSubjectId: identity?.subject ?? null,
      capturedAt: Date.now(),
      snapshot: snapshot,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 0,
    });

    return { revisionId, revisionNumber: nextRevisionNumber };
  },
});

// Send a proposal and capture its revision snapshot in ONE Convex transaction
// (spec §5.5 / Priority 10). A MUTATION (not an action) so the generated
// `Proposal_send` and `captureProposalRevision` run as subtransactions of a
// single transaction (Convex guideline: nested runMutation from a mutation =
// subtransactions; an uncaught throw rolls back the whole txn). Send runs first;
// if capture then throws, the send rolls back too — so a proposal is NEVER left
// "sent without its immutable revision." Capture rarely fails for a sendable
// proposal (the send guard already verified client.status == "active", and the
// revision insert is schema-valid), so a capture failure surfaces as a loud
// send error rather than a silently-missing audit snapshot. `ctx.runMutation`
// propagates the operator's auth, so Proposal_send's salesAccess guard passes.
// `changeSummary` defaults to a sent-label so callers need not pass it.
export const sendProposalWithRevisionCapture = mutation({
  args: {
    docId: v.id("proposals"),
    version: v.optional(v.number()),
    changeSummary: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Doc<"proposals">> => {
    // spec §5.4 L276: a proposal may not be published while a catalog-linked
    // line carries an UNAPPROVED price override — a unitPrice that diverges from
    // the linked MenuDish.sellingPrice with no recorded reason. Free-form lines
    // (no menuDishId) and exact-price catalog lines are never overrides and
    // always pass. Narrow by design: this is a real spec requirement (sales
    // price overrides must be justified and auditable), not policy tedium — it
    // fires only when an operator BOTH linked a catalog dish AND changed its
    // price. Runs before Proposal_send so a blocked proposal is not partially
    // sent; an uncaught throw rolls back the whole transaction.
    //
    // Fetch the proposal first: fail fast + non-disclosing on an unknown id,
    // and establish the tenant so only SAME-TENANT catalog dishes are audited.
    // The caller is not yet authorized (Proposal_send's salesAccess guard runs
    // next), so read no foreign line/price detail and throw no disclosing
    // message — a foreign proposal id must not leak its lines or prices.
    const proposal = await ctx.db.get(args.docId);
    if (!proposal) throw new Error("Proposal not found");
    const tenantId = proposal.tenantId;
    const overrideLines = (
      await ctx.db
        .query("proposalLineItems")
        .withIndex("by_proposalId", (q: any) => q.eq(args.docId))
        .collect()
    ).filter((row: any) => row.deletedAt == null && row.menuDishId != null);
    for (const line of overrideLines) {
      // menuDishId is a uuid? column (`string | null | undefined`); the filter
      // above guarantees non-null at runtime. Cast to the typed id so ctx.db.get
      // resolves to Doc<"menuDishes"> (sellingPrice/tenantId read cleanly).
      const menuDish = await ctx.db.get(line.menuDishId as Id<"menuDishes">);
      // Foreign-tenant / missing / unpriced link → nothing comparable; skip
      // (never audit or disclose a foreign catalog dish's price).
      if (
        !menuDish ||
        menuDish.tenantId !== tenantId ||
        menuDish.sellingPrice == null
      ) {
        continue;
      }
      const unit = round2(Number(line.unitPrice));
      const catalog = round2(Number(menuDish.sellingPrice));
      if (
        unit !== catalog &&
        (!line.overrideReason || line.overrideReason.trim().length === 0)
      ) {
        // Non-disclosing (names no line or price): the proposal may not belong
        // to the caller. The inline UI already flags each divergent line, so the
        // operator knows where to add the reason.
        throw new Error(
          "One or more catalog-linked lines have an unapproved price override. Add an override reason to each before sending (spec §5.4).",
        );
      }
    }
    const sent = await ctx.runMutation(api.mutations.Proposal_send, {
      docId: args.docId,
      version: args.version,
    });
    await ctx.runMutation(
      internal.lib.proposalRevision.captureProposalRevision,
      {
        proposalId: args.docId,
        changeSummary:
          args.changeSummary && args.changeSummary.trim().length > 0
            ? args.changeSummary.trim()
            : "Proposal sent to client",
      },
    );
    return sent;
  },
});
