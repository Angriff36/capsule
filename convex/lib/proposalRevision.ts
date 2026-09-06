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
    visibleSections: string[];
    status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "superseded";
    draftedAt: number | null;
    sentAt: number | null;
  };
  client: {
    id: string;
    name: string;
  };
  // §8.2 / §5.2 (spec L263 "Venue logistics snapshot" required section, L376
  // "snapshot the venue information needed to reproduce the client and
  // operations plan"): the venue's logistics frozen into the immutable
  // revision so an accepted/shared proposal stays reproducible after later
  // venue edits (§5.5 L284). Null when the proposal isn't linked through an
  // event to a venue (Proposal.eventId → Event.venueId → Venue); the free-text
  // proposal.venueName/venueAddress remain the always-present fallback then.
  venue: {
    name: string;
    venueType: string;
    capacity: number;
    onPremise: boolean | null;
    kitchenAccess: string | null;
    parkingAvailable: boolean | null;
    hasFreightElevator: boolean | null;
    storageAvailable: boolean | null;
    logisticsNotes: string | null;
    loadInInstructions: string | null;
    powerAvailable: boolean | null;
    waterAccess: boolean | null;
    hasStairs: boolean | null;
    wasteRules: string | null;
    permitsInsuranceNotes: string | null;
    restrictions: string | null;
    accessNotes: string | null;
    cateringNotes: string | null;
  } | null;
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
  timeline: Array<{
    name: string;
    startsAt: number;
    endsAt: number | null;
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
  // Optional upgrades offered separately from priced lines. Active rows only
  // (deletedAt null, addedAt set) are frozen into the revision at send.
  enhancements: Array<{
    name: string;
    description: string | null;
    price: number;
    sortOrder: number;
  }>;
  tenant: {
    name: string;
  };
}

// §8.2: resolve the venue logistics to freeze into the revision snapshot. Two
// optional hops Proposal.eventId → Event.venueId → Venue. Returns null
// (non-disclosing) when the proposal isn't event-linked or the event has no
// venue — the free-text proposal.venueName/venueAddress remain the venue
// identity in that case. Same-tenant guard is belt-and-braces; the FK
// `references` already enforce tenant scoping.
async function resolveVenueLogistics(
  ctx: { db: any },
  proposal: Doc<"proposals">,
): Promise<ProposalRevisionSnapshot["venue"]> {
  if (!proposal.eventId) return null;
  const event: any = await ctx.db.get(proposal.eventId);
  if (!event || event.tenantId !== proposal.tenantId) return null;
  if (!event.venueId) return null;
  const venue: any = await ctx.db.get(event.venueId);
  if (!venue || venue.deletedAt != null || venue.tenantId !== proposal.tenantId) {
    return null;
  }
  return {
    name: venue.name,
    venueType: venue.venueType,
    capacity: venue.capacity,
    onPremise: venue.onPremise ?? null,
    kitchenAccess: venue.kitchenAccess ?? null,
    parkingAvailable: venue.parkingAvailable ?? null,
    hasFreightElevator: venue.hasFreightElevator ?? null,
    storageAvailable: venue.storageAvailable ?? null,
    logisticsNotes: venue.logisticsNotes ?? null,
    loadInInstructions: venue.loadInInstructions ?? null,
    powerAvailable: venue.powerAvailable ?? null,
    waterAccess: venue.waterAccess ?? null,
    hasStairs: venue.hasStairs ?? null,
    wasteRules: venue.wasteRules ?? null,
    permitsInsuranceNotes: venue.permitsInsuranceNotes ?? null,
    restrictions: venue.restrictions ?? null,
    accessNotes: venue.accessNotes ?? null,
    cateringNotes: venue.cateringNotes ?? null,
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
      .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposal._id))
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

  // Get the tenant's name from its live organization record (the Branding
  // row) — same resolution as convex/authProvision.ts companyNameForProvision:
  // active row first, any live row second, brandDisplayName (the
  // customer-facing name the PDF masthead shows) before the legal name. The
  // revision is immutable, so a placeholder would be frozen into it forever;
  // "Tenant" survives only when the tenant has no organization record (R2-13).
  const organizations = await ctx.db
    .query("organizations")
    .withIndex("by_tenantId", (q: any) => q.eq("tenantId", proposal.tenantId))
    .collect();
  const organization =
    organizations.find(
      (row: any) => row.deletedAt == null && String(row.status) === "active",
    ) ?? organizations.find((row: any) => row.deletedAt == null);
  const tenantName =
    organization?.brandDisplayName?.trim() ||
    organization?.name?.trim() ||
    "Tenant";

  // Get priced line items (spec §5.4) — effective prices snapshotted here.
  // JS loose-equality filter (not the Convex DSL .eq) because governed-creation
  // omits deletedAt at insert, so fresh active rows have it ABSENT (undefined),
  // and the DSL `.eq("deletedAt", null)` would miss them. Matches the working
  // pattern in convex/queries.ts listProposalLineItemByTenantId.
  const lineItems = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposal._id))
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

  const enhancementRows = (
    await ctx.db
      .query("proposalEnhancements")
      .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposal._id))
      .collect()
  ).filter(
    (row: any) => row.deletedAt == null && row.addedAt != null,
  );
  const enhancementsData = enhancementRows
    .map((row: any) => ({
      name: row.name,
      description: row.description ?? null,
      price: row.price,
      sortOrder: row.sortOrder,
    }))
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder);

  const timelineData = proposal.eventId
    ? (
        await ctx.db
          .query("eventTimelineActivities")
          .withIndex("by_eventId", (q: any) =>
            q.eq("eventId", proposal.eventId),
          )
          .collect()
      )
        .filter(
          (row: any) =>
            row.tenantId === proposal.tenantId &&
            row.deletedAt == null &&
            row.startsAt != null,
        )
        .sort(
          (a: any, b: any) =>
            Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0),
        )
        .map((row: any) => ({
          name: row.name,
          startsAt: row.startsAt,
          endsAt: row.endsAt ?? null,
        }))
    : [];

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
      visibleSections: (proposal.visibleSections ?? []).filter(
        (section): section is string => typeof section === "string",
      ),
      status: proposal.status,
      draftedAt: proposal.draftedAt ?? null,
      sentAt: proposal.sentAt ?? null,
    },
    client: {
      id: client._id.toString(),
      name: client.clientType === "company" ? (client.companyName ?? "Unknown Company") : `${client.givenName ?? ""} ${client.familyName ?? ""}`.trim() || "Unknown Client",
    },
    venue: await resolveVenueLogistics(ctx, proposal),
    dishSelections: dishSelectionsData,
    timeline: timelineData,
    lineItems: lineItemsData,
    enhancements: enhancementsData,
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
        .withIndex("by_proposalId", (q: any) => q.eq("proposalId", proposalId))
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
        .withIndex("by_proposalId", (q: any) => q.eq("proposalId", args.docId))
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
