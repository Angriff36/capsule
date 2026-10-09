// PL-SCALE (AC-172): the dishes a screen shows, by id. The generated dish
// list (queries.listDish) reads every dish of the company; at 5,000 dishes
// its first read after any dish change took 2.5 s on a running backend, and
// the event page and its tabs read it only to name the dishes on one menu.
// Same read rule and same row shape as the generated list.
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";
import { canRead } from "./search";

/** Most dishes one call reads. */
export const DISH_IDS_CAP = 500;

export type DishRow = Doc<"dishes"> & {
  isActive: boolean;
  isRetired: boolean;
  isCanonicalRoot: boolean;
};

const DISH_READERS = ["kitchenAccess", "salesAccess", "manageAccess"];

function dishRow(dish: Doc<"dishes">): DishRow {
  return {
    ...dish,
    isActive: dish.status === "active",
    isRetired: dish.status === "retired",
    isCanonicalRoot:
      dish.canonicalDishId == null && dish.mergedIntoDishId == null,
  };
}

/** Live dishes with these ids (ids past DISH_IDS_CAP are ignored). */
export const byIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<DishRow[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, DISH_READERS)) return null;
    const rows: DishRow[] = [];
    for (const raw of [...new Set(ids)].slice(0, DISH_IDS_CAP)) {
      const id = ctx.db.normalizeId("dishes", raw);
      const dish = id ? await ctx.db.get(id) : null;
      if (!dish || dish.tenantId !== auth.tenantId || dish.deletedAt != null)
        continue;
      rows.push(dishRow(dish));
    }
    return rows;
  },
});

/** Live dishes offered only at this venue (venue-exclusive menu items). */
export const exclusiveToVenue = query({
  args: { venueId: v.string() },
  handler: async (ctx, { venueId }): Promise<DishRow[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, DISH_READERS)) return null;
    const id = ctx.db.normalizeId("venues", venueId);
    if (!id) return [];
    const dishes = await ctx.db
      .query("dishes")
      .withIndex("by_exclusiveVenueId", (q) => q.eq("exclusiveVenueId", id))
      .take(200);
    return dishes
      .filter((d) => d.tenantId === auth.tenantId && d.deletedAt == null)
      .map(dishRow);
  },
});

/**
 * The company's dishes one page at a time, in the generated list's order.
 * Each page is its own read, so a dish change re-reads only the page that
 * holds it (about 500 dishes), not all of them. Deleted dishes are left out,
 * so a page can hold fewer rows than asked.
 */
export const page = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, DISH_READERS)) {
      return { page: [] as DishRow[], isDone: true, continueCursor: "" };
    }
    const tenantId = auth.tenantId;
    const result = await ctx.db
      .query("dishes")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.filter((d) => d.deletedAt == null).map(dishRow),
    };
  },
});

const SEARCH_LIMIT = 40;

/**
 * Live dishes whose name matches the typed text (at most 40); with no text,
 * the newest. A dish picker searches; it never loads the whole catalog.
 */
export const search = query({
  args: { text: v.string() },
  handler: async (ctx, { text }): Promise<DishRow[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, DISH_READERS)) return null;
    const tenantId = auth.tenantId;
    const typed = text.trim();
    const rows = typed
      ? await ctx.db
          .query("dishes")
          .withSearchIndex("search_name", (q) =>
            q.search("name", typed).eq("tenantId", tenantId),
          )
          .take(SEARCH_LIMIT * 2)
      : await ctx.db
          .query("dishes")
          .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
          .order("desc")
          .take(SEARCH_LIMIT * 2);
    return rows
      .filter((dish) => dish.deletedAt == null)
      .slice(0, SEARCH_LIMIT)
      .map(dishRow);
  },
});

const FAMILY_CAP = 100;
const FACET_SAMPLE = 300;

/**
 * A dish's family: its main dish and every version of that main dish (what
 * the dish page shows as tabs). Never the whole catalog.
 */
export const family = query({
  args: { dishId: v.string() },
  handler: async (ctx, { dishId }): Promise<DishRow[] | null> => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, DISH_READERS)) return null;
    const id = ctx.db.normalizeId("dishes", dishId);
    const dish = id ? await ctx.db.get(id) : null;
    if (!dish || dish.tenantId !== auth.tenantId) return [];
    const mainId = dish.versionOfDishId ?? dish._id;
    const main = mainId === dish._id ? dish : await ctx.db.get(mainId);
    const versions = await ctx.db
      .query("dishes")
      .withIndex("by_versionOfDishId", (q) => q.eq("versionOfDishId", mainId))
      .take(FAMILY_CAP);
    return [main, ...versions]
      .filter(
        (row): row is Doc<"dishes"> =>
          row != null &&
          row.tenantId === auth.tenantId &&
          row.deletedAt == null,
      )
      .map(dishRow);
  },
});

/**
 * Category, course and diet tag values in use, from the newest 300 dishes:
 * the new-dish form's suggestions, without reading the whole catalog.
 */
export const facets = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    if (!auth.tenantId || !canRead(auth, DISH_READERS)) return null;
    const tenantId = auth.tenantId;
    const rows = (
      await ctx.db
        .query("dishes")
        .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
        .order("desc")
        .take(FACET_SAMPLE)
    ).filter((dish) => dish.deletedAt == null && dish.mergedIntoDishId == null);
    return rows.map((dish) => ({
      category: dish.category ?? null,
      course: dish.course ?? null,
      dietaryTags: dish.dietaryTags ?? [],
    }));
  },
});
