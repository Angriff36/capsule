// PL-PROPOSAL-DRAFT: read the event facts a proposal draft is built from.
// Read-only; shared by the build mutation (proposalGenerate.ts) and the draft
// report query (proposalDraftReport.ts). Prices come only from a published
// menu (resolveCatalogPrice, the same check the line editors and send use).

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { resolveCatalogPrice } from "./proposalPricing";
import type {
  DraftIssue,
  EventFacts,
  ExistingLine,
  LineSource,
} from "../../src/lib/proposalGeneration";

export type EventSourceRead = {
  event: Doc<"events">;
  venue: Doc<"venues"> | null;
  facts: EventFacts;
  sources: LineSource[];
  /** Dishes on the event that have no single menu price. */
  unpriced: DraftIssue[];
};

const live = (row: { deletedAt?: number | null } | null | undefined) =>
  !!row && row.deletedAt == null;

/** The event in the caller's workspace, or a plain "not found". */
export async function readScopedEvent(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
  eventId: Id<"events">,
): Promise<Doc<"events">> {
  const event = await ctx.db.get(eventId);
  if (!event || event.tenantId !== tenantId || !live(event)) {
    throw new Error("Event not found");
  }
  return event;
}

export async function readEventSources(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
): Promise<EventSourceRead> {
  const tenantId = event.tenantId;
  const venueRow = event.venueId ? await ctx.db.get(event.venueId) : null;
  const venue = venueRow && venueRow.tenantId === tenantId && live(venueRow) ? venueRow : null;
  const venueAddress =
    event.venueAddress?.trim() ||
    [venue?.addressLine1, venue?.addressLine2].filter((part) => part?.trim()).join(", ") ||
    null;
  const facts: EventFacts = {
    eventDate: event.startsAt ?? null,
    eventEndDate: event.endsAt ?? null,
    eventType: event.eventType?.trim() || null,
    venueName: event.venueName?.trim() || venue?.name?.trim() || null,
    venueAddress,
    guestCount: Math.max(0, Math.trunc(Number(event.expectedHeadcount) || 0)),
  };

  const dishes = (
    await ctx.db
      .query("eventDishes")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()
  )
    .filter((row) => row.tenantId === tenantId && live(row) && row.removedAt == null)
    .sort(
      (a, b) =>
        (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
        a._creationTime - b._creationTime,
    );

  const sources: LineSource[] = [];
  const unpriced: DraftIssue[] = [];
  for (const [index, row] of dishes.entries()) {
    const dish = await ctx.db.get(row.dishId);
    const name = row.dishName?.trim() || (dish && dish.tenantId === tenantId ? dish.name : "") || "Dish";
    const quantity = Math.max(0, Math.trunc(Number(row.quantityServings) || 0));
    if (quantity === 0) continue; // 86'd: not served, not sold.
    const offers: { id: Id<"menuDishes">; price: number }[] = [];
    for (const menuDish of await ctx.db
      .query("menuDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", row.dishId))
      .collect()) {
      const price = await resolveCatalogPrice(ctx, menuDish._id, tenantId);
      if (price != null) offers.push({ id: menuDish._id, price });
    }
    const prices = new Set(offers.map((offer) => Math.round(offer.price * 100)));
    if (prices.size !== 1) {
      unpriced.push({
        code: prices.size === 0 ? "dish_no_menu_price" : "dish_menu_price_differs",
        message:
          prices.size === 0
            ? `${name} has no price on a published menu, so it is not on the proposal. Price it on a menu, then build again.`
            : `${name} has different prices on different menus, so it is not on the proposal. Add it by hand with the price you want.`,
        recordIds: [String(row._id)],
      });
      continue;
    }
    const offer = offers[0];
    const values = {
      description: name,
      pricingBasis: "per_unit",
      unitPrice: offer.price,
      quantity,
      menuDishId: String(offer.id),
    };
    sources.push({
      sourceKey: `eventDish:${row._id}`,
      fingerprint: JSON.stringify([String(row.dishId), values]),
      values,
      sortOrder: index,
      sources: [
        { table: "eventDishes", id: String(row._id) },
        { table: "menuDishes", id: String(offer.id) },
      ],
    });
  }
  return { event, venue, facts, sources, unpriced };
}

/** Every line row of a proposal (removed ones too) keyed by id. */
export async function readProposalLines(
  ctx: Pick<QueryCtx, "db">,
  proposal: Doc<"proposals">,
): Promise<{ rows: Doc<"proposalLineItems">[]; existing: Map<string, ExistingLine> }> {
  const rows = (
    await ctx.db
      .query("proposalLineItems")
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposal._id))
      .collect()
  ).filter((row) => row.tenantId === proposal.tenantId);
  const existing = new Map<string, ExistingLine>(
    rows.map((row) => [
      String(row._id),
      {
        id: String(row._id),
        live: row.deletedAt == null && row.removedAt == null,
        values: {
          description: row.description,
          pricingBasis: String(row.pricingBasis),
          unitPrice: Number(row.unitPrice) || 0,
          quantity: Number(row.quantity) || 0,
          menuDishId: row.menuDishId ? String(row.menuDishId) : null,
        },
      },
    ]),
  );
  return { rows, existing };
}

/** The unsent draft this event's builds keep refreshing, if any. */
export async function findGeneratedDraft(
  ctx: Pick<QueryCtx, "db">,
  event: Doc<"events">,
): Promise<Doc<"proposals"> | null> {
  const drafts = (
    await ctx.db
      .query("proposals")
      .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
      .collect()
  ).filter(
    (row) =>
      row.tenantId === event.tenantId &&
      live(row) &&
      row.status === "draft",
  );
  drafts.sort((a, b) => b._creationTime - a._creationTime);
  const generated = drafts.find((row) => row.generationJson != null);
  if (generated) return generated;
  // The inquiry conversion links an empty draft to the event; building the
  // proposal fills that draft instead of starting a second one. A draft
  // someone already priced by hand is never taken over.
  for (const draft of drafts) {
    if (!(await hasHandEnteredContent(ctx, draft._id))) return draft;
  }
  return null;
}

async function hasHandEnteredContent(
  ctx: Pick<QueryCtx, "db">,
  proposalId: Id<"proposals">,
): Promise<boolean> {
  const kept = (row: {
    deletedAt?: number | null;
    removedAt?: number | null;
  }) => row.deletedAt == null && row.removedAt == null;
  for (const table of [
    "proposalLineItems",
    "proposalDishSelections",
    "proposalEnhancements",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
      .collect();
    if (rows.some(kept)) return true;
  }
  return false;
}
