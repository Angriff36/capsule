// Proposal Revision Capture - Authored seam for proposal revision snapshotting

import { internalMutation, mutation } from "../_generated/server";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";

// 2dp rounding for comparing stored money(12,2) values (float-stable).
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// Resolve a catalog link's validated sellingPrice, or null if invalid (spec
// §5.4 L276; codex review findings 3/C): same-tenant, non-removed MenuDish
// (deletedAt null, addedAt set), priced, in a non-deleted published menu, with
// an active dish — the same rules proposalPricing.resolveCatalogPrice enforces.
// Kept LOCAL (not imported across modules) so this module's raw-write +
// event-table references stay clear of the event-manifest integration guard.
// Non-throwing: the publish snapshot records null; the send audit throws on null.
async function resolveCatalogPrice(
  ctx: { db: any },
  menuDishId: Id<"menuDishes"> | string | null | undefined,
  tenantId: string,
): Promise<number | null> {
  if (!menuDishId) return null;
  const md: any = await ctx.db.get(menuDishId);
  if (
    !md ||
    md.deletedAt != null ||
    md.addedAt == null ||
    md.tenantId !== tenantId ||
    md.sellingPrice == null
  ) {
    return null;
  }
  const menu: any = await ctx.db.get(md.menuId);
  if (!menu || menu.deletedAt != null || String(menu.status) !== "published") {
    return null;
  }
  const dish: any = await ctx.db.get(md.dishId);
  if (!dish || String(dish.status) !== "active") return null;
  return Number(md.sellingPrice);
}

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
        // of later MenuDish.sellingPrice edits. resolveCatalogPrice returns null
        // for any foreign / missing / removed / unpriced / unpublished / inactive
        // link — no foreign-price leak into the immutable revision (codex 3/C).
        const catalogPrice = line.menuDishId
          ? await resolveCatalogPrice(ctx, line.menuDishId, proposal.tenantId)
          : null;
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
          catalogPrice,
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
    // Verify the caller's tenant BEFORE reading any lines (codex review finding
    // 2): otherwise the audit's throw-vs-proceed would oracle a foreign
    // proposal's price-divergence state. A tenant mismatch is indistinguishable
    // from a missing proposal (same "not found" error Proposal_send's salesAccess
    // guard raises), so no information leaks.
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || auth.tenantId !== tenantId) {
      throw new Error("Proposal not found");
    }
    const overrideLines = (
      await ctx.db
        .query("proposalLineItems")
        .withIndex("by_proposalId", (q: any) => q.eq(args.docId))
        .collect()
    ).filter((row: any) => row.deletedAt == null && row.menuDishId != null);
    for (const line of overrideLines) {
      // Reject (do not skip) any invalid catalog link — resolveCatalogPrice
      // returns null for missing / removed / foreign-tenant / unpriced /
      // unpublished-menu / inactive-dish (codex review 3/C). Same validator the
      // write seams use.
      const catalog = await resolveCatalogPrice(
        ctx,
        line.menuDishId as Id<"menuDishes">,
        tenantId,
      );
      if (catalog == null) {
        throw new Error(
          "One or more catalog-linked lines point to an invalid menu dish (missing, removed, foreign-tenant, unpriced, or not in an active published menu). Fix the link before sending.",
        );
      }
      const unit = round2(Number(line.unitPrice));
      if (
        unit !== round2(catalog) &&
        (!line.overrideReason || line.overrideReason.trim().length === 0)
      ) {
        // Non-disclosing (names no line or price). The caller's tenant was
        // verified above, so this is an own-tenant proposal; the inline UI still
        // flags each divergent line so the operator knows where to add a reason.
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
