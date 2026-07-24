import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useListInventoryItem,
  useListRecipe,
  useListRecipeIngredient,
} from "../../lib/manifest-convex-react";
import { recipePath } from "../kitchen/kitchenRoutes";

const TOP_N = 6;

type Suggestion = {
  recipeId: string;
  name: string;
  coverage: number;
  linesInStock: number;
  lineCount: number;
};

// ponytail: coverage is a demand-weighted-by-line average of onHand/demand per
// ingredient. It ignores unit conversion (recipe line unit vs inventory unit) —
// good enough to rank "what can I mostly make from stock". Add a unit-normalizer
// if recipes routinely mix units for the same ingredient.
export function computeSuggestions(
  recipes: ReturnType<typeof useListRecipe>,
  lines: ReturnType<typeof useListRecipeIngredient>,
  inventory: ReturnType<typeof useListInventoryItem>,
): Suggestion[] {
  if (!recipes || !lines || !inventory) return [];

  const onHand = new Map<string, number>();
  for (const item of inventory) {
    if (item.deletedAt != null) continue;
    onHand.set(
      item.ingredientId,
      (onHand.get(item.ingredientId) ?? 0) + item.quantityOnHand,
    );
  }

  const byRecipe = new Map<string, typeof lines>();
  for (const line of lines) {
    if (line.deletedAt != null) continue;
    const bucket = byRecipe.get(line.recipeId) ?? [];
    bucket.push(line);
    byRecipe.set(line.recipeId, bucket);
  }

  const suggestions: Suggestion[] = [];
  for (const recipe of recipes) {
    if (recipe.deletedAt != null) continue;
    if (String(recipe.status) !== "published") continue;
    const recipeLines = byRecipe.get(recipe._id);
    if (!recipeLines || recipeLines.length === 0) continue;

    let ratioSum = 0;
    let linesInStock = 0;
    let counted = 0;
    for (const line of recipeLines) {
      const demand = line.quantity * (line.wasteFactor ?? 1);
      if (demand <= 0) continue;
      counted += 1;
      const available = onHand.get(line.ingredientId) ?? 0;
      const ratio = Math.min(available / demand, 1);
      ratioSum += ratio;
      if (ratio >= 1) linesInStock += 1;
    }
    if (counted === 0) continue;

    suggestions.push({
      recipeId: recipe._id,
      name: recipe.name,
      coverage: ratioSum / counted,
      linesInStock,
      lineCount: counted,
    });
  }

  return suggestions
    .filter((s) => s.coverage > 0)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, TOP_N);
}

export function RecipeStockSuggestions() {
  const recipes = useListRecipe();
  const lines = useListRecipeIngredient();
  const inventory = useListInventoryItem();
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(
    () => computeSuggestions(recipes, lines, inventory),
    [recipes, lines, inventory],
  );

  const loading = recipes == null || lines == null || inventory == null;

  return (
    <section
      className="border border-line bg-surface"
      data-testid="recipe-stock-suggestions"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 p-3 text-left"
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <span className="text-[15px] font-semibold">
            Suggested from stock
          </span>
          <span className="ml-2 text-[13px] text-ink-2">
            Recipes you can mostly make with ingredients already on hand
          </span>
        </span>
        <span className="text-[13px] text-ink-3">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
        <div className="border-t border-line p-3">
          {loading ? (
            <p className="text-[13px] text-ink-2">Loading inventory…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-[13px] text-ink-2">
              No published recipes have ingredient coverage from current stock.
            </p>
          ) : (
            <ul className="space-y-2">
              {suggestions.map((suggestion) => (
                <li
                  key={suggestion.recipeId}
                  className="flex items-center justify-between gap-3"
                  data-testid="recipe-stock-suggestion"
                >
                  <Link
                    to={recipePath(suggestion.recipeId)}
                    className="text-[14px] font-medium hover:underline"
                  >
                    {suggestion.name}
                  </Link>
                  <span className="flex items-center gap-2 whitespace-nowrap font-mono text-[11px] text-ink-3">
                    <span
                      className="inline-block h-1.5 w-24 overflow-hidden rounded bg-line"
                      aria-hidden
                    >
                      <span
                        className="block h-full bg-ink-2"
                        style={{
                          width: `${Math.round(suggestion.coverage * 100)}%`,
                        }}
                      />
                    </span>
                    {Math.round(suggestion.coverage * 100)}% ·{" "}
                    {suggestion.linesInStock}/{suggestion.lineCount} in stock
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </section>
  );
}
