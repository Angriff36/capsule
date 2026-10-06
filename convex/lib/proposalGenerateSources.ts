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
  // Dishes with no single per-dish price, kept so a per-guest menu can price them.
  const noDishPrice: { row: Doc<"eventDishes">; name: string; issue: DraftIssue }[] = [];
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
      const issue: DraftIssue = {
        code: prices.size === 0 ? "dish_no_menu_price" : "dish_menu_price_differs",
        message:
          prices.size === 0
            ? `${name} has no price on a published menu, so it is not on the proposal. Price it on a menu, then build again.`
            : `${name} has different prices on different menus, so it is not on the proposal. Add it by hand with the price you want.`,
        recordIds: [String(row._id)],
      };
      if (prices.size === 0) noDishPrice.push({ row, name, issue });
      else unpriced.push(issue);
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
  unpriced.push(
    ...(await perGuestMenuLines(ctx, tenantId, noDishPrice, sources, dishes.length)),
  );
  return { event, venue, facts, sources, unpriced };
}

/**
 * Caterers price most menus per guest, not per dish. When the event serves
 * every dish of a published menu that has a per-guest price, that menu becomes
 * one per-guest line (plus its base price, if any). A dish only covered by part
 * of such a menu stays an issue that names the menu, so nobody is charged a full
 * menu price for half of it.
 */
async function perGuestMenuLines(
  ctx: Pick<QueryCtx, "db">,
  tenantId: string,
  pending: { row: Doc<"eventDishes">; name: string; issue: DraftIssue }[],
  sources: LineSource[],
  firstSortOrder: number,
): Promise<DraftIssue[]> {
  const menus = new Map<string, { menu: Doc<"menus">; dishIds: Set<string> }>();
  for (const { row } of pending) {
    for (const menuDish of await ctx.db
      .query("menuDishes")
      .withIndex("by_dishId", (q) => q.eq("dishId", row.dishId))
      .collect()) {
      if (menuDish.tenantId !== tenantId || !live(menuDish) || menuDish.removedAt != null) continue;
      const key = String(menuDish.menuId);
      if (menus.has(key)) continue;
      const menu = await ctx.db.get(menuDish.menuId);
      if (!menu || menu.tenantId !== tenantId || !live(menu)) continue;
      if (String(menu.status) !== "published" || !(Number(menu.pricePerPerson) > 0)) continue;
      const dishIds = new Set(
        (
          await ctx.db
            .query("menuDishes")
            .withIndex("by_menuId", (q) => q.eq("menuId", menu._id))
            .collect()
        )
          .filter((line) => line.tenantId === tenantId && live(line) && line.removedAt == null)
          .map((line) => String(line.dishId)),
      );
      menus.set(key, { menu, dishIds });
    }
  }
  const onEvent = new Set(pending.map(({ row }) => String(row.dishId)));
  const covered = new Set<string>();
  let sortOrder = firstSortOrder;
  // Biggest menu first, so a smaller menu inside it is never charged as well.
  const byReach = [...menus.values()].sort((a, b) => b.dishIds.size - a.dishIds.size);
  for (const { menu, dishIds } of byReach) {
    if (dishIds.size === 0 || [...dishIds].some((id) => !onEvent.has(id))) continue;
    if ([...dishIds].every((id) => covered.has(id))) continue;
    for (const id of dishIds) covered.add(id);
    const lines: [string, string, number][] = [
      [`menu:${menu._id}`, "per_person", Number(menu.pricePerPerson)],
    ];
    if (Number(menu.basePrice) > 0) {
      lines.push([`menuBase:${menu._id}`, "flat", Number(menu.basePrice)]);
    }
    for (const [sourceKey, pricingBasis, unitPrice] of lines) {
      const values = {
        description:
          pricingBasis === "per_person" ? `${menu.name} (per guest)` : `${menu.name} (base price)`,
        pricingBasis,
        unitPrice,
        quantity: 1,
        menuDishId: null,
      };
      sources.push({
        sourceKey,
        fingerprint: JSON.stringify([String(menu._id), values]),
        values,
        sortOrder: sortOrder++,
        sources: [{ table: "menus", id: String(menu._id) }],
      });
    }
  }
  const issues: DraftIssue[] = [];
  for (const { row, name, issue } of pending) {
    if (covered.has(String(row.dishId))) continue;
    const partial = [...menus.values()].find(({ dishIds }) => dishIds.has(String(row.dishId)));
    issues.push(
      partial
        ? {
            ...issue,
            message: `${name} is on ${partial.menu.name}, which is priced per guest, but this event serves only part of that menu. Add a per-guest line with the price you want.`,
          }
        : issue,
    );
  }
  return issues;
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
  // someone already priced by hand, or a change of an earlier proposal, is
  // never taken over.
  for (const draft of drafts) {
    if (draft.replacesProposalId != null) continue;
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
