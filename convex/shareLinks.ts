import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

/**
 * AUTHOR SEAM — public, token-authorized proposal share links (spec §4.6).
 *
 * A ShareLink's Convex `_id` IS the public bearer token (unguessable, like the
 * SignatureRequest callbackToken). These two functions are the ONLY public
 * surface for a shared proposal: they authenticate by token in-handler (no
 * Clerk auth) — the same posture as the anonymous `clientPortal.getEvent`
 * query. `getSharedProposal` is read-only; `recordShareView` is a raw
 * `ctx.db.patch` (no generated guard, no Clerk auth) that bumps view stats. Both
 * enforce revocation + expiry against the row before doing anything, so a
 * revoked/expired link resolves to nothing.
 *
 * The link is pinned to an immutable ProposalRevision (captured at send), so the
 * client always sees the exact terms that were shared — later proposal edits
 * produce a new revision and never mutate the shared one (spec §4.6 "Done when").
 */

type SharedProposal = {
  ok: true;
  proposal: {
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
  };
  // §5.2 L263 "Venue logistics snapshot": the client-facing projection of the
  // frozen venue logistics (§8.2). Null when the proposal wasn't linked to a
  // venue at send time. Operator-authored free-text notes (access/catering/
  // logistics) stay in the immutable snapshot for ops reproduction but are
  // NOT surfaced to the client.
  venueLogistics: {
    onPremise: boolean | null;
    capacity: number | null;
    loadInInstructions: string | null;
    powerAvailable: boolean | null;
    waterAccess: boolean | null;
    hasStairs: boolean | null;
    hasFreightElevator: boolean | null;
    parkingAvailable: boolean | null;
    kitchenAccess: string | null;
    wasteRules: string | null;
    permitsInsuranceNotes: string | null;
    restrictions: string | null;
  } | null;
  clientName: string;
  lineItems: Array<{
    description: string;
    pricingBasis: string;
    unitPrice: number;
    quantity: number;
    unit: string | null;
    amount: number;
  }>;
  enhancements: Array<{
    name: string;
    description: string | null;
    price: number;
  }>;
  dishSelections: Array<{
    dishName: string;
    dishDescription: string | null;
    course: string | null;
    serviceStyle: string | null;
  }>;
  timeline: Array<{ name: string; startsAt: number; endsAt: number | null }>;
  revisionNumber: number;
  capturedAt: number | null;
  linkCreatedAt: number | null;
  linkExpiresAt: number | null;
};

/** Resolve a share token to the pinned revision's client-safe view, or null. */
export const getSharedProposal = query({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<SharedProposal | null> => {
    const linkId = ctx.db.normalizeId("shareLinks", token);
    if (!linkId) return null;
    const link: Doc<"shareLinks"> | null = await ctx.db.get(linkId);
    if (!link || link.deletedAt != null) return null;
    // Revocation + expiry are read-time checks against the persisted row.
    if (link.status !== "active") return null;
    if (link.expiresAt != null && link.expiresAt <= Date.now()) return null;

    const revision: Doc<"proposalRevisions"> | null = await ctx.db.get(
      link.proposalRevisionId,
    );
    if (
      !revision ||
      revision.deletedAt != null ||
      revision.tenantId !== link.tenantId
    ) {
      return null;
    }

    let snapshot: Record<string, unknown> = {};
    try {
      snapshot = revision.snapshot ? JSON.parse(revision.snapshot) : {};
    } catch {
      return null;
    }
    const proposal = (snapshot.proposal ?? {}) as Record<string, unknown>;
    const client = (snapshot.client ?? {}) as Record<string, unknown>;
    const lineItems = Array.isArray(snapshot.lineItems)
      ? (snapshot.lineItems as Array<Record<string, unknown>>)
      : [];
    const enhancements = Array.isArray(snapshot.enhancements)
      ? (snapshot.enhancements as Array<Record<string, unknown>>)
      : [];
    const num = (value: unknown, fallback = 0): number =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    const str = (value: unknown): string | null =>
      typeof value === "string" && value.length > 0 ? value : null;
    const bool = (value: unknown): boolean | null =>
      typeof value === "boolean" ? value : null;
    const venueSnap =
      snapshot.venue && typeof snapshot.venue === "object"
        ? (snapshot.venue as Record<string, unknown>)
        : null;
    const venueLogistics: SharedProposal["venueLogistics"] = venueSnap
      ? {
          onPremise: bool(venueSnap.onPremise),
          capacity:
            typeof venueSnap.capacity === "number" ? venueSnap.capacity : null,
          loadInInstructions: str(venueSnap.loadInInstructions),
          powerAvailable: bool(venueSnap.powerAvailable),
          waterAccess: bool(venueSnap.waterAccess),
          hasStairs: bool(venueSnap.hasStairs),
          hasFreightElevator: bool(venueSnap.hasFreightElevator),
          parkingAvailable: bool(venueSnap.parkingAvailable),
          kitchenAccess: str(venueSnap.kitchenAccess),
          wasteRules: str(venueSnap.wasteRules),
          permitsInsuranceNotes: str(venueSnap.permitsInsuranceNotes),
          restrictions: str(venueSnap.restrictions),
        }
      : null;

    return {
      ok: true,
      proposal: {
        proposalNumber: str(proposal.proposalNumber),
        title: typeof proposal.title === "string" ? proposal.title : "Proposal",
        eventDate:
          typeof proposal.eventDate === "number" ? proposal.eventDate : null,
        eventType: str(proposal.eventType),
        guestCount: num(proposal.guestCount),
        venueName: str(proposal.venueName),
        venueAddress: str(proposal.venueAddress),
        subtotal: num(proposal.subtotal),
        taxAmount: num(proposal.taxAmount),
        discountAmount: num(proposal.discountAmount),
        total: num(proposal.total),
        expiresAt:
          typeof proposal.expiresAt === "number" ? proposal.expiresAt : null,
        notes: str(proposal.notes),
        terms: str(proposal.terms),
        visibleSections: Array.isArray(proposal.visibleSections)
          ? proposal.visibleSections.filter(
              (section): section is string => typeof section === "string",
            )
          : [],
      },
      venueLogistics,
      clientName:
        typeof client.name === "string" && client.name.length > 0
          ? client.name
          : "Client",
      lineItems: lineItems.map((line) => ({
        description:
          typeof line.description === "string" ? line.description : "",
        pricingBasis:
          typeof line.pricingBasis === "string" ? line.pricingBasis : "flat",
        unitPrice: num(line.unitPrice),
        quantity: num(line.quantity, 1),
        unit: str(line.unit),
        amount: num(line.amount),
      })),
      enhancements: enhancements
        .map((item, index) => ({
          sortOrder: num(item.sortOrder, index),
          name: typeof item.name === "string" ? item.name : "",
          description: str(item.description),
          price: num(item.price),
        }))
        .filter((item) => item.name.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(({ name, description, price }) => ({
          name,
          description,
          price,
        })),
      dishSelections: (Array.isArray(snapshot.dishSelections)
        ? (snapshot.dishSelections as Array<Record<string, unknown>>)
        : []
      ).map((dish) => ({
        dishName: str(dish.dishName) ?? "Menu item",
        dishDescription: str(dish.dishDescription),
        course: str(dish.course),
        serviceStyle: str(dish.serviceStyle),
      })),
      timeline: (Array.isArray(snapshot.timeline)
        ? (snapshot.timeline as Array<Record<string, unknown>>)
        : []
      )
        .filter(
          (item) =>
            typeof item.name === "string" && typeof item.startsAt === "number",
        )
        .map((item) => ({
          name: String(item.name),
          startsAt: Number(item.startsAt),
          endsAt: typeof item.endsAt === "number" ? item.endsAt : null,
        })),
      revisionNumber: revision.revisionNumber,
      capturedAt: revision.capturedAt ?? null,
      linkCreatedAt: link.createdAt ?? null,
      linkExpiresAt: link.expiresAt ?? null,
    };
  },
});

/**
 * Record a view against a share link (spec §4.6: first/last view + viewer
 * identity when known). Public, token-authorized; a revoked/expired/unknown
 * token is a silent no-op (no view recorded). Raw patch — no guard, no Clerk.
 */
export const recordShareView = mutation({
  args: { token: v.string(), viewerIdentity: v.optional(v.string()) },
  handler: async (ctx, { token, viewerIdentity }): Promise<void> => {
    const linkId = ctx.db.normalizeId("shareLinks", token);
    if (!linkId) return;
    const link: Doc<"shareLinks"> | null = await ctx.db.get(linkId);
    if (!link || link.deletedAt != null) return;
    if (link.status !== "active") return;
    if (link.expiresAt != null && link.expiresAt <= Date.now()) return;

    const now = Date.now();
    await ctx.db.patch(linkId, {
      viewCount: (link.viewCount ?? 0) + 1,
      firstViewedAt: link.firstViewedAt ?? now,
      lastViewedAt: now,
      lastViewerIdentity: viewerIdentity ?? link.lastViewerIdentity,
      updatedAt: now,
    } as Partial<Doc<"shareLinks">>);
  },
});

// Reference the Id type so the import stays meaningful for callers/tests.
export type ShareLinkId = Id<"shareLinks">;
