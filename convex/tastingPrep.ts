/**
 * AUTHOR SEAM — the small prep list for one client tasting.
 *
 * Built on read from the tasting's sample dishes: for each dish, the portions
 * to plate, the total amount at the dish's portion size, its recipe parts
 * (with pieces needed when a piece count per portion is set) and its prep
 * steps. Nothing is written, so a tasting never adds to event demand.
 */
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { getAuthContext, requireTenant } from "./lib/authContext";
import { canRead } from "./search";

export interface TastingPrepDish {
  tastingDishId: string;
  dishId: string;
  dishName: string;
  portions: number;
  totalAmount: number;
  portionUnit: string;
  allergens: string[];
  components: { name: string; piecesNeeded: number | null }[];
  steps: { name: string; station: string | null }[];
}

export const prepList = query({
  args: { tastingId: v.id("tastings") },
  handler: async (ctx, args): Promise<TastingPrepDish[]> => {
    const auth = await getAuthContext(ctx);
    const tenantId = requireTenant(auth);
    if (!canRead(auth, ["salesAccess"]))
      throw new ConvexError("Sales staff may see tasting prep lists.");
    const tasting = await ctx.db.get(args.tastingId);
    if (!tasting || tasting.tenantId !== tenantId || tasting.deletedAt != null)
      return [];
    const rows = (
      await ctx.db
        .query("tastingDishes")
        .withIndex("by_tastingId", (q) => q.eq("tastingId", args.tastingId))
        .collect()
    )
      .filter((row) => row.tenantId === tenantId && row.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const out: TastingPrepDish[] = [];
    for (const row of rows) {
      const dish = await ctx.db.get(row.dishId);
      if (!dish || dish.tenantId !== tenantId) continue;
      const links = (
        await ctx.db
          .query("dishComponents")
          .withIndex("by_dishId", (q) => q.eq("dishId", row.dishId))
          .collect()
      )
        .filter(
          (link) =>
            link.tenantId === tenantId &&
            link.deletedAt == null &&
            link.removedAt == null,
        )
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const components: TastingPrepDish["components"] = [];
      for (const link of links) {
        const component = await ctx.db.get(link.componentId);
        if (!component || component.tenantId !== tenantId) continue;
        components.push({
          name: component.name,
          piecesNeeded:
            link.pieceCount != null ? link.pieceCount * row.portionCount : null,
        });
      }
      const steps = (
        await ctx.db
          .query("dishTasks")
          .withIndex("by_dishId", (q) => q.eq("dishId", row.dishId))
          .collect()
      )
        .filter(
          (task) =>
            task.tenantId === tenantId &&
            task.deletedAt == null &&
            task.status === "active",
        )
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((task) => ({ name: task.name, station: task.station ?? null }));
      out.push({
        tastingDishId: row._id,
        dishId: row.dishId,
        dishName: dish.name,
        portions: row.portionCount,
        totalAmount: dish.portionSize * row.portionCount,
        portionUnit: dish.portionUnit,
        allergens: (dish.allergenSummary ?? []).filter(
          (code): code is NonNullable<typeof code> => code != null,
        ),
        components,
        steps,
      });
    }
    return out;
  },
});
