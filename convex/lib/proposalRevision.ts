// Proposal Revision Capture - Authored seam for proposal revision snapshotting

import { internalMutation, mutation, type QueryCtx } from "../_generated/server";
import { storageNotOwnedElsewhere } from "../fileStorage";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { v } from "convex/values";
import { getAuthContext } from "./authContext";
import {
  liveVenue,
  venueFactsSnapshot,
  type VenueFactsSnapshot,
} from "./venueFactsSnapshot";
import { effectiveSellingPrice } from "../../src/lib/catalogEligibility";
import { proposalPictureRefs, type ProposalPictureRef } from "./proposalPictures";

// 2dp rounding for comparing stored money(12,2) values (float-stable).
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// AC-547: the rental item a line names, same company and still in use; the
// same rule proposalPricing.resolveRentalItem enforces at write. Kept local
// for the reason given on resolveCatalogPrice below.
async function resolveRentalItem(
  ctx: { db: any },
  equipmentId: string,
  tenantId: string,
): Promise<{ name: string; ownership: string } | null> {
  const item: any = await ctx.db.get(equipmentId as Id<"equipments">);
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
    md.tenantId !== tenantId
  ) {
    return null;
  }
  // The price in force today — a dated price change applies from its day on.
  const price = effectiveSellingPrice(md, Date.now());
  if (price == null) return null;
  const menu: any = await ctx.db.get(md.menuId);
  if (!menu || menu.deletedAt != null || String(menu.status) !== "published") {
    return null;
  }
  const dish: any = await ctx.db.get(md.dishId);
  if (!dish || String(dish.status) !== "active") return null;
  return price;
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
    // AC-259: staff section order; [] = standard order (and older revisions).
    sectionOrder: string[];
    status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired" | "superseded";
    draftedAt: number | null;
    sentAt: number | null;
  };
  client: {
    id: string;
    name: string;
  };
  // AC-378/AC-420: a change to an accepted proposal names the proposal and
  // the exact revision the client accepted, and the event. Null on an
  // ordinary proposal; absent on revisions made before this field existed.
  changeOf?: {
    proposalId: string;
    acceptedRevisionId: string | null;
    eventId: string | null;
  } | null;
  // §8.2 / §5.2 (spec L263 "Venue logistics snapshot" required section, L376
  // "snapshot the venue information needed to reproduce the client and
  // operations plan"): the venue's logistics frozen into the immutable
  // revision so an accepted/shared proposal stays reproducible after later
  // venue edits (§5.5 L284). Null when the proposal isn't linked through an
  // event to a venue (Proposal.eventId → Event.venueId → Venue); the free-text
  // proposal.venueName/venueAddress remain the always-present fallback then.
  // PL-VENUE-PROFILE operating facts are optional: absent on older revisions.
  venue: VenueFactsSnapshot | null;
  // Venue Partner Playbook section 06: the partner venue whose logo shows
  // next to the company's. Null when the venue is not a partner; absent on
  // revisions made before co-branding.
  partnerVenue?: {
    name: string;
    logoStorageId: string | null;
    brandColor: string | null;
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
    // AC-547: the rental/decor item this line prices (same company only), with
    // its name as it was when the proposal went out. Null on other lines and
    // on revisions made before rental lines existed.
    rentalItem: { id: string; name: string; ownership: string } | null;
  }>;
  // Optional upgrades offered separately from priced lines. Active rows only
  // (deletedAt null, addedAt set) are frozen into the revision at send.
  enhancements: Array<{
    name: string;
    description: string | null;
    price: number;
    sortOrder: number;
  }>;
  // AC-654: the pictures of the dishes on the proposal when it went out.
  // Absent on revisions made before pictures were frozen.
  pictures?: ProposalPictureRef[];
  tenant: {
    /** Null when the company has no name on record (AC-096). */
    name: string | null;
  };
}

// §8.2: resolve the venue logistics to freeze into the revision snapshot. Two
// optional hops Proposal.eventId → Event.venueId → Venue. Returns null
// (non-disclosing) when the proposal isn't event-linked or the event has no
// venue — the free-text proposal.venueName/venueAddress remain the venue
// identity in that case. Same-tenant guard is belt-and-braces; the FK
// `references` already enforce tenant scoping.
async function linkedVenue(
  ctx: { db: any },
  proposal: Doc<"proposals">,
): Promise<Doc<"venues"> | null> {
  if (!proposal.eventId) return null;
  const event: any = await ctx.db.get(proposal.eventId);
  if (!event || event.tenantId !== proposal.tenantId) return null;
  if (!event.venueId) return null;
  return await liveVenue(ctx, proposal.tenantId, event.venueId);
}

// Venue Partner Playbook section 06: a proposal for an event at a partner
// venue carries the venue's name, logo and brand colour, frozen at send.
// A logo file another company owns is never frozen (knowing a storage id
// grants nothing).
async function partnerVenueBrand(
  ctx: { db: any },
  venue: Doc<"venues"> | null,
): Promise<ProposalRevisionSnapshot["partnerVenue"]> {
  if (!venue || !venue.partnerTier) return null;
  const logo = venue.logoStorageId;
  return {
    name: venue.name,
    logoStorageId:
      logo && (await storageNotOwnedElsewhere(ctx as QueryCtx, venue.tenantId, logo))
        ? logo
        : null,
    brandColor: venue.brandColor ?? null,
  };
}

// The tenant's customer-facing name from its live organization record (the
// Branding row) — same resolution as convex/authProvision.ts
// companyNameForProvision: active row first, any live row second,
// brandDisplayName (the name the PDF masthead shows) before the legal name.
// Null when the tenant has no name at all (AC-096).
export async function resolveTenantBrandName(
  ctx: { db: any },
  tenantId: string,
): Promise<string | null> {
  const organizations = await ctx.db
    .query("organizations")
    .withIndex("by_tenantId", (q: any) => q.eq("tenantId", tenantId))
    .collect();
  const organization =
    organizations.find(
      (row: any) => row.deletedAt == null && String(row.status) === "active",
    ) ?? organizations.find((row: any) => row.deletedAt == null);
  return organization?.brandDisplayName?.trim() || organization?.name?.trim() || null;
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
  // revision is immutable, so a placeholder would be frozen into it forever.
  // AC-096: with no organization name the revision stores null, never a
  // made-up "Tenant"; the draft report asks the office to add the name.
  const tenantName = await resolveTenantBrandName(ctx, proposal.tenantId);

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
        const rental = line.equipmentId
          ? await resolveRentalItem(ctx, line.equipmentId, proposal.tenantId)
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
          rentalItem: rental
            ? { id: line.equipmentId.toString(), ...rental }
            : null,
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

  const venue = await linkedVenue(ctx, proposal);
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
      sectionOrder: (proposal.sectionOrder ?? []).filter(
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
    changeOf: await acceptedChangeSource(ctx, proposal),
    venue: venue ? venueFactsSnapshot(venue) : null,
    partnerVenue: await partnerVenueBrand(ctx, venue),
    dishSelections: dishSelectionsData,
    timeline: timelineData,
    lineItems: lineItemsData,
    enhancements: enhancementsData,
    pictures: await proposalPictureRefs(ctx, proposal),
    tenant: {
      name: tenantName,
    },
  };

  return JSON.stringify(snapshot);
}

/** The accepted proposal this one changes, with its accepted revision. */
async function acceptedChangeSource(
  ctx: { db: any },
  proposal: Doc<"proposals">,
): Promise<ProposalRevisionSnapshot["changeOf"]> {
  if (!proposal.replacesProposalId) return null;
  const source: Doc<"proposals"> | null = await ctx.db.get(
    proposal.replacesProposalId as Id<"proposals">,
  );
  if (!source || source.tenantId !== proposal.tenantId || source.status !== "accepted") {
    return null;
  }
  return {
    proposalId: String(source._id),
    acceptedRevisionId: source.acceptedRevisionId ? String(source.acceptedRevisionId) : null,
    eventId: proposal.eventId
      ? String(proposal.eventId)
      : source.eventId
        ? String(source.eventId)
        : null,
  };
}

/** Highest revision number along the proposals this one replaces. */
async function earlierRevisionNumber(
  ctx: { db: any },
  proposal: Doc<"proposals">,
): Promise<number> {
  let highest = 0;
  const seen = new Set<string>([String(proposal._id)]);
  let previousId = proposal.replacesProposalId;
  while (previousId && !seen.has(String(previousId))) {
    seen.add(String(previousId));
    const previous: Doc<"proposals"> | null = await ctx.db.get(
      previousId as Id<"proposals">,
    );
    if (!previous || previous.tenantId !== proposal.tenantId) break;
    const revisions = (
      await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposalId", (q: any) => q.eq("proposalId", previous._id))
        .collect()
    ).filter((row: any) => row.deletedAt == null);
    for (const revision of revisions) {
      highest = Math.max(highest, revision.revisionNumber);
    }
    previousId = previous.replacesProposalId;
  }
  return highest;
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

    // AC-256: a new version of a proposal carries on its numbering, so the
    // client sees Revision 2 after Revision 1 of the proposal it replaces.
    const maxRevision = Math.max(
      0,
      ...existingRevisions.map((rev) => rev.revisionNumber),
      await earlierRevisionNumber(ctx, proposal),
    );
    const nextRevisionNumber = maxRevision + 1;

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
    // AC-256/AC-257: sending a new version replaces the sent, unanswered
    // proposal it was made from, in the same transaction. An accepted source
    // stays accepted (a change never rewrites a signed agreement).
    const replaces = proposal.replacesProposalId
      ? await ctx.db.get(proposal.replacesProposalId as Id<"proposals">)
      : null;
    if (
      replaces &&
      replaces.tenantId === tenantId &&
      replaces.deletedAt == null &&
      (replaces.status === "sent" || replaces.status === "viewed")
    ) {
      await ctx.runMutation(api.mutations.Proposal_supersede, {
        docId: replaces._id,
        version: replaces.version,
        revisedById: args.docId,
        reason: "Replaced by a newer version",
      });
    }
    return sent;
  },
});
