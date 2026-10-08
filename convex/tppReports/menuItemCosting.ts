import { readableRecipeAmount } from "../../src/lib/recipeDisplay";
import type {
  TppReportResult,
  TppRow,
} from "../../src/features/reports/tpp/types";
import type { QueryCtx } from "../_generated/server";
import { dishPortionCosts } from "../lib/eventPacket/dishCosts";
import { isLiveTenantRow } from "./shared";

/**
 * Menu items costed in one run. Costing reads each item's recipe lines and
 * their ingredients, so a whole catalog at once would pass the read limit
 * (TPP timed out on the same report for ~2,800 items). A category narrows it.
 */
export const MENU_ITEM_COSTING_LIMIT = 400;
/**
 * Menu items read to find a category. Far above the shared 2,000-row report
 * cut so a category is found anywhere in a ~2,800-item catalog; dish rows are
 * small, so this stays well inside the read limit.
 */
const MENU_ITEM_READ_LIMIT = 8_000;

/**
 * TPP "Menu Item Costing": each active menu item's cost per portion from its
 * recipe and the ingredient catalog costs (the kitchen's costing rules). An
 * item with any unpriced or unconverted line shows "No" and no cost, never a
 * low cost that looks complete.
 */
export async function menuItemCostingReport(
  ctx: QueryCtx,
  tenantId: string,
  title: string,
  categoryFilter: string,
): Promise<TppReportResult> {
  const wanted = categoryFilter.trim().toLowerCase();
  const dishes = (
    await ctx.db
      .query("dishes")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", tenantId))
      .take(MENU_ITEM_READ_LIMIT)
  )
    .filter(
      (dish) =>
        isLiveTenantRow(dish, tenantId) &&
        dish.status === "active" &&
        dish.mergedIntoDishId == null &&
        (wanted === "" ||
          (dish.category ?? "").trim().toLowerCase() === wanted),
    )
    // Items with no category come last.
    .sort(
      (a, b) =>
        Number(!a.category?.trim()) - Number(!b.category?.trim()) ||
        (a.category ?? "").localeCompare(b.category ?? "") ||
        a.name.localeCompare(b.name),
    );
  const costed = dishes.slice(0, MENU_ITEM_COSTING_LIMIT);
  const costs = await dishPortionCosts(
    ctx,
    tenantId,
    costed.map((dish) => String(dish._id)),
  );
  const rows: TppRow[] = costed.map((dish) => {
    const cost = costs.get(String(dish._id)) ?? null;
    return {
      id: dish._id,
      values: {
        item: dish.name,
        category: dish.category ?? "",
        costed: cost == null ? "No" : "Yes",
        portionCost: cost,
        portion: readableRecipeAmount(dish.portionSize, dish.portionUnit),
      },
      recipeLinks: { item: { kind: "dish", id: String(dish._id) } },
    };
  });
  const fullyCosted = rows.filter((row) => row.values.costed === "Yes").length;
  return {
    kind: "financial",
    title,
    columns: [
      { key: "item", label: "Menu item", kind: "text" },
      { key: "category", label: "Category", kind: "text" },
      { key: "costed", label: "Fully costed?", kind: "text" },
      { key: "portionCost", label: "Cost per portion", kind: "money" },
      { key: "portion", label: "Portion", kind: "text" },
    ],
    rows,
    groups: [],
    totals: [],
    measures: [
      {
        key: "fullyCosted",
        label: "Fully costed",
        value: fullyCosted,
        kind: "number",
        emphasis: "primary",
      },
      {
        key: "notCosted",
        label: "Missing a cost",
        value: rows.length - fullyCosted,
        kind: "number",
      },
    ],
    ...(dishes.length > costed.length
      ? {
          notices: [
            `Only the first ${MENU_ITEM_COSTING_LIMIT} of ${dishes.length} menu items were costed. Type a category to see the rest.`,
          ],
        }
      : {}),
  };
}
