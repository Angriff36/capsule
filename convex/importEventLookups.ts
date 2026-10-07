// PL-SOURCE-DATASETS (AC-057): TPP's event list report prints each event's
// occasion, referral source ("Referred From") and sales person by name. The
// event import gives the event the company's occasion and referral source of
// that name, and adds one to the company's list when it has none yet (the old
// system's lists are the company's real lists). The sales person is the one
// active person with that exact name; a person is never made up, so with no
// single match the event keeps the printed name only. A printed venue name
// joins the one saved venue of that name that has an address to drive to
// (the website-inquiry rule, lib/quoteInquiryVenue); otherwise the event keeps
// the printed venue name only.

import { v } from "convex/values";
import { api } from "./_generated/api";
import { internalQuery, type ActionCtx } from "./_generated/server";
import { plainName } from "./importClientByName";
import { type InquiryVenueRow } from "./lib/quoteInquiryVenue";

export type LookupRow = { id: string; keys: string[] };

export type EventLookups = {
  occasions: LookupRow[];
  referralSources: LookupRow[];
  people: LookupRow[];
  venues: InquiryVenueRow[];
};

/** "Corporate Event" -> "corporate_event": the code a new list row gets. */
export const lookupCode = (name: string) => plainName(name).replace(/ /g, "_");

/** The one row whose name (or code) is this printed name, if exactly one. */
export function findLookup(
  rows: readonly LookupRow[],
  name: string,
): string | null {
  const wanted = plainName(name);
  if (!wanted) return null;
  const hits = rows.filter((row) => row.keys.includes(wanted));
  return hits.length === 1 ? hits[0]!.id : null;
}

/** The company's active occasions, referral sources, people and venues. */
export const eventLookups = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }): Promise<EventLookups> => {
    const [occasions, referralSources, people, venues] = await Promise.all([
      ctx.db
        .query("occasions")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("referralSources")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("people")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
      ctx.db
        .query("venues")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect(),
    ]);
    const listRow = (row: {
      _id: string;
      name: string;
      code: string;
    }): LookupRow => ({
      id: row._id,
      keys: [plainName(row.name), plainName(row.code.replace(/_/g, " "))],
    });
    return {
      occasions: occasions
        .filter((o) => o.deletedAt == null && o.status === "active")
        .map(listRow),
      referralSources: referralSources
        .filter((r) => r.deletedAt == null && r.status === "active")
        .map(listRow),
      people: people
        .filter((p) => p.deletedAt == null && p.status === "active")
        .map((p) => ({
          id: p._id,
          keys: [plainName(`${p.givenName} ${p.familyName}`)],
        })),
      venues: venues.map((venue) => ({
        _id: venue._id,
        name: venue.name,
        status: venue.status,
        deletedAt: venue.deletedAt,
        addressLine1: venue.addressLine1,
        city: venue.city,
        latitude: venue.latitude,
        longitude: venue.longitude,
      })),
    };
  },
});

export type EventLookupFields = {
  occasionId?: string;
  occasionName?: string;
  referralSourceId?: string;
  assignedToId?: string;
  ownerName?: string;
};

/** Lookups for one import batch; `refused` = names that could not be added. */
export type BatchLookups = EventLookups & { refused: Set<string> };

/**
 * The occasion, referral source and sales person an imported event gets.
 * A missing occasion or referral source is added to the company's list once
 * (later rows find it in `lookups`); when the importing person may not add
 * one, the event keeps the printed occasion name and no referral source.
 */
export async function eventLookupFields(
  ctx: ActionCtx,
  lookups: BatchLookups,
  printed: { occasion?: string; referralSource?: string; owner?: string },
): Promise<EventLookupFields> {
  const fields: EventLookupFields = {};
  if (printed.occasion) {
    fields.occasionName = printed.occasion;
    const id = await findOrAdd(lookups, "occasions", printed.occasion, (args) =>
      ctx.runMutation(api.mutations.Occasion_createViaRegister, args),
    );
    if (id) fields.occasionId = id;
  }
  if (printed.referralSource) {
    const id = await findOrAdd(
      lookups,
      "referralSources",
      printed.referralSource,
      (args) =>
        ctx.runMutation(api.mutations.ReferralSource_createViaRegister, args),
    );
    if (id) fields.referralSourceId = id;
  }
  if (printed.owner) {
    fields.ownerName = printed.owner;
    const id = findLookup(lookups.people, printed.owner);
    if (id) fields.assignedToId = id;
  }
  return fields;
}

async function findOrAdd(
  lookups: BatchLookups,
  list: "occasions" | "referralSources",
  name: string,
  register: (args: {
    name: string;
    code: string;
    sortOrder: number;
  }) => Promise<unknown>,
): Promise<string | null> {
  const rows = lookups[list];
  const found = findLookup(rows, name);
  if (found) return found;
  const key = plainName(name);
  // No name, two rows with this name (never guess), or not allowed to add.
  if (
    !key ||
    lookups.refused.has(`${list}:${key}`) ||
    rows.some((row) => row.keys.includes(key))
  )
    return null;
  try {
    const created = (await register({
      name,
      code: lookupCode(name),
      sortOrder: rows.length,
    })) as { docId: string };
    rows.push({ id: created.docId, keys: [key] });
    return created.docId;
  } catch {
    // Not allowed, or an inactive row holds the code: keep the name only.
    lookups.refused.add(`${list}:${key}`);
    return null;
  }
}

// AC-277: the old system's menu export prices about a third of its items
// (Portion Price). An imported dish with a price goes on the company's draft
// price list for its old category ("Old system prices - Air Catering") at
// that price, so the price is a real menu price a manager can check and
// publish. A draft is never on the public menu or the proposal picker, so an
// old price is not quoted to a client until someone publishes the list. A row
// with no price (blank or 0) adds nothing; the price stays on the import.
// A dish imported before (a later file, or dishes brought in before prices
// were read) is added once; a dish already on its list is left as it is.

type OldPriceMenu = { id: string; status: string; dishIds: Set<string> };

/** Menus by plain name; null = the name could not be made (not allowed). */
export type OldPriceMenus = Map<string, OldPriceMenu | null>;

const OLD_PRICE_LIST = "Old system prices - ";

export const oldPriceMenuName = (category: string | undefined) =>
  `${OLD_PRICE_LIST}${category?.trim() || "No category"}`;

/** The company's live old-system price lists and the dishes on each. */
export const oldPriceMenus = internalQuery({
  args: { tenantId: v.string() },
  handler: async (ctx, { tenantId }) => {
    const prefix = plainName(OLD_PRICE_LIST);
    const menus = (
      await ctx.db
        .query("menus")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .collect()
    ).filter(
      (menu) =>
        menu.deletedAt == null && plainName(menu.name).startsWith(prefix),
    );
    return await Promise.all(
      menus.map(async (menu) => ({
        key: plainName(menu.name),
        id: String(menu._id),
        status: String(menu.status),
        dishIds: (
          await ctx.db
            .query("menuDishes")
            .withIndex("by_menuId", (q) => q.eq("menuId", menu._id))
            .collect()
        )
          .filter((line) => line.deletedAt == null && line.removedAt == null)
          .map((line) => String(line.dishId)),
      })),
    );
  },
});

/** Put one imported dish on its old-category price list; false = not added. */
export async function addOldMenuPrice(
  ctx: ActionCtx,
  menus: OldPriceMenus,
  args: {
    category: string | undefined;
    dishId: string;
    price: number;
    idempotencyKey: string;
  },
): Promise<boolean> {
  const name = oldPriceMenuName(args.category);
  const key = plainName(name);
  let menu = menus.get(key);
  if (menu === undefined) {
    try {
      const created = (await ctx.runMutation(
        api.mutations.Menu_createViaDraft,
        {
          name,
          category: args.category?.trim() || undefined,
          description:
            "Prices from the old system's menu export. Check them, then publish this menu to quote from it.",
          idempotencyKey: `${args.idempotencyKey}:price-list`,
        },
      )) as { docId: string };
      menu = { id: created.docId, status: "draft", dishIds: new Set() };
    } catch {
      // Not allowed to make menus: the price stays on the import only.
      menu = null;
    }
    menus.set(key, menu);
  }
  // A list someone already published or archived is left as it is.
  if (!menu || menu.status !== "draft" || menu.dishIds.has(args.dishId))
    return false;
  try {
    await ctx.runMutation(api.mutations.MenuDish_createViaAdd, {
      menuId: menu.id,
      dishId: args.dishId,
      sellingPrice: args.price,
      idempotencyKey: `${args.idempotencyKey}:price`,
    });
    menu.dishIds.add(args.dishId);
    return true;
  } catch {
    return false;
  }
}
