import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Enough rows that a few deleted or other-company prices on top still leave
// the real latest one.
const NEWEST = 10;

/**
 * The newest price rows of one ingredient, wherever its latest price sits:
 * dated prices newest first, plus undated ones (their save time counts), so
 * latestPriceByIngredient picks the same row it did from the full history.
 */
export async function newestPriceRows(
  ctx: Pick<QueryCtx, "db">,
  ingredientId: Id<"ingredients">,
): Promise<Doc<"ingredientPriceObservations">[]> {
  const index = "by_ingredientId_and_observedAt_and_createdAt" as const;
  const [dated, ...undated] = await Promise.all([
    ctx.db
      .query("ingredientPriceObservations")
      .withIndex(index, (q) =>
        q.eq("ingredientId", ingredientId).gt("observedAt", null),
      )
      .order("desc")
      .take(NEWEST),
    ...[null, undefined].map((observedAt) =>
      ctx.db
        .query("ingredientPriceObservations")
        .withIndex(index, (q) =>
          q.eq("ingredientId", ingredientId).eq("observedAt", observedAt),
        )
        .order("desc")
        .take(NEWEST),
    ),
  ]);
  return [...dated, ...undated.flat()];
}
