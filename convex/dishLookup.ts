// PL-SCALE (AC-172): the dishes a screen shows, by id. The generated dish
// list (queries.listDish) reads every dish of the company; at 5,000 dishes
// its first read after any dish change took 2.5 s on a running backend, and
// the event page and its tabs read it only to name the dishes on one menu.
// Same read rule and same row shape as the generated list.
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

/** Live dishes with these ids (ids past DISH_IDS_CAP are ignored). */
export const byIds = query({
  args: { ids: v.array(v.string()) },
  handler: async (ctx, { ids }): Promise<DishRow[] | null> => {
    const auth = await getAuthContext(ctx);
    if (
      !auth.tenantId ||
      !canRead(auth, ["kitchenAccess", "salesAccess", "manageAccess"])
    )
      return null;
    const rows: DishRow[] = [];
    for (const raw of [...new Set(ids)].slice(0, DISH_IDS_CAP)) {
      const id = ctx.db.normalizeId("dishes", raw);
      const dish = id ? await ctx.db.get(id) : null;
      if (!dish || dish.tenantId !== auth.tenantId || dish.deletedAt != null)
        continue;
      rows.push({
        ...dish,
        isActive: dish.status === "active",
        isRetired: dish.status === "retired",
        isCanonicalRoot:
          dish.canonicalDishId == null && dish.mergedIntoDishId == null,
      });
    }
    return rows;
  },
});
