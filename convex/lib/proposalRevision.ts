// Proposal Revision Capture - Authored seam for proposal revision snapshotting

import { internalMutation, mutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { v } from "convex/values";

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

  // Get dish selections for this proposal
  const dishSelections = await ctx.db
    .query("proposalDishSelections")
    .withIndex("by_proposalId", (q: any) => q.eq(proposal._id))
    .filter((q: any) => q.eq("deletedAt", null))
    .collect();

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
  const lineItemsData = lineItems
    .map((line: any) => ({
      id: line._id.toString(),
      description: line.description,
      pricingBasis: line.pricingBasis,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      unit: line.unit ?? null,
      amount: line.amount,
      sortOrder: line.sortOrder,
      notes: line.notes ?? null,
    }))
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

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
