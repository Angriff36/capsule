import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateDishRecipe,
  useDishRecipeDetach,
  useListDishRecipe,
  useListRecipe,
} from "../../lib/manifest-convex-react";
import { recipePath } from "./kitchenRoutes";

// DishRecipe attach/detach — the first hop of the purchasing chain.
//
// Without a row here a dish contributes nothing downstream: EventDishAdded
// fans out over DishRecipe to seed EventDishRecipeSeed, which drives
// RecipeIngredient -> EventIngredientContribution -> IngredientDemand ->
// PurchaseNeed -> VendorOrder. It is also what live food cost, the allergen
// matrix and margin reporting read. DishRecipe.attach existed but was only
// reachable from the agent command bridge, so every dish in the app had zero
// recipe lines and the whole chain read empty.

type Props = {
  dishId: string;
};

export function DishRecipesPanel({ dishId }: Props) {
  const dishRecipes = useListDishRecipe();
  const recipes = useListRecipe();
  const attachRecipe = useCreateDishRecipe();
  const detachRecipe = useDishRecipeDetach();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = (dishRecipes ?? [])
    .filter((row) => row.deletedAt == null && row.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const attachedIds = new Set(rows.map((row) => row.recipeId));
  const available = (recipes ?? []).filter(
    (recipe) => recipe.deletedAt == null && !attachedIds.has(recipe._id),
  );

  async function onAttach(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const recipeId = String(data.get("recipeId") ?? "");
    if (!recipeId) {
      setError("Pick a recipe to attach.");
      return;
    }
    const recipe = recipes?.find((entry) => entry._id === recipeId);
    // Default to the recipe's own yield so a cook never has to retype it.
    const yieldQuantity = Number(data.get("yieldQuantity") ?? 0);
    setBusy("attach");
    setError(null);
    setNotice(null);
    try {
      await attachRecipe({
        dishId,
        recipeId,
        yieldQuantity:
          yieldQuantity > 0
            ? yieldQuantity
            : Number(recipe?.yieldQuantity) || 1,
        batchMultiplier: Number(data.get("batchMultiplier") ?? 1) || 1,
        role: String(data.get("role") ?? "").trim() || undefined,
        sortOrder: rows.length,
      });
      form.reset();
      setNotice(
        "Recipe attached. Its ingredients now drive demand, purchasing, and food cost for every event using this dish.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not attach the recipe.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onDetach(id: string, version: number | undefined) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await detachRecipe({ docId: id, version, reason: "Removed from dish" });
      setNotice("Recipe detached.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not detach the recipe.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="culinary-section">
      <div className="culinary-section-heading">
        <h2>Recipes in this dish</h2>
        <span>{rows.length} attached</span>
      </div>

      {error ? <p className="text-[13px] text-danger">{error}</p> : null}
      {notice ? (
        <p className="text-[13px] text-success" role="status">
          {notice}
        </p>
      ) : null}

      {dishRecipes === undefined ? (
        <p className="text-[13px] text-ink-2">Loading recipes…</p>
      ) : rows.length === 0 ? (
        <div className="document-empty">
          <p>
            No recipe attached. Until one is, this dish generates no ingredient
            demand, no purchase needs, and no food cost.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((row) => {
            const recipe = recipes?.find((entry) => entry._id === row.recipeId);
            return (
              <li
                key={row._id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
                data-testid="dish-recipe-row"
              >
                <div>
                  {recipe ? (
                    <Link
                      to={recipePath(recipe._id)}
                      className="text-[14px] font-medium text-accent underline-offset-2 hover:underline"
                    >
                      {recipe.name}
                    </Link>
                  ) : (
                    <p className="text-[14px] font-medium text-ink">
                      Recipe unavailable
                    </p>
                  )}
                  <p className="font-mono text-[11px] text-ink-3">
                    yields {row.yieldQuantity}
                    {recipe?.yieldUnit ? ` ${String(recipe.yieldUnit)}` : ""} ·
                    batch ×{row.batchMultiplier}
                    {row.role ? ` · ${row.role}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => void onDetach(row._id, row.version)}
                >
                  {busy === row._id ? "Working…" : "Detach"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={onAttach}>
        <label className="block text-[12px] sm:col-span-2">
          <span className="meta-term">Recipe</span>
          <select name="recipeId" className="input mt-1" defaultValue="">
            <option value="">Select a recipe…</option>
            {available.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Yield (0 = the recipe&apos;s own)</span>
          <input
            name="yieldQuantity"
            type="number"
            min={0}
            step="0.01"
            defaultValue={0}
            className="input mt-1"
          />
        </label>
        <label className="block text-[12px]">
          <span className="meta-term">Batch multiplier</span>
          <input
            name="batchMultiplier"
            type="number"
            min={0.01}
            step="0.01"
            defaultValue={1}
            className="input mt-1"
          />
        </label>
        <label className="block text-[12px] sm:col-span-2">
          <span className="meta-term">Role (optional)</span>
          <input
            name="role"
            className="input mt-1"
            placeholder="base, sauce, garnish"
          />
        </label>
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy != null || available.length === 0}
          >
            {busy === "attach" ? "Attaching…" : "Attach recipe"}
          </button>
        </div>
      </form>
    </section>
  );
}
