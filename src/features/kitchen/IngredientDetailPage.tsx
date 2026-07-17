import { Link, useParams } from "react-router-dom";
import {
  useGetIngredient,
  useIngredientDiscontinue,
  useIngredientReinstate,
  useListRecipe,
  useListRecipeIngredient,
} from "../../lib/manifest-convex-react";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { KitchenBookNav } from "./KitchenBookNav";
import { kitchenCatalogPath } from "./kitchenRoutes";
import { useState } from "react";

const policy = new CulinaryLifecyclePolicy();

export function IngredientDetailPage() {
  const { id } = useParams();
  const ingredient = useGetIngredient(id ?? "skip");
  const recipes = useListRecipe();
  const lines = useListRecipeIngredient();
  const discontinue = useIngredientDiscontinue();
  const reinstate = useIngredientReinstate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  if (!id) return <ErrorState title="Ingredient not found" />;
  if (ingredient === undefined) {
    return (
      <div className="culinary-document culinary-document-compact space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (ingredient === null || ingredient.deletedAt != null) {
    return (
      <ErrorState
        title="Ingredient not found"
        detail="This ingredient is unavailable or no longer exists."
      />
    );
  }

  const recipeUses = (lines ?? [])
    .filter(
      (line) => line.deletedAt == null && line.ingredientId === ingredient._id,
    )
    .map((line) => ({
      line,
      recipe: (recipes ?? []).find((recipe) => recipe._id === line.recipeId),
    }))
    .filter((entry) => entry.recipe && entry.recipe.deletedAt == null);

  const actions = policy.ingredientActions(String(ingredient.status));

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="culinary-document culinary-document-compact">
      <Link
        to={kitchenCatalogPath("ingredients")}
        className="text-[12px] text-ink-3 hover:text-ink"
      >
        ← Ingredient index
      </Link>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Ingredient · Edition {ingredient.version}</p>
            <h1 className="culinary-title-compact">{ingredient.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                className="btn btn-ghost"
                disabled={busy != null}
                onClick={() => {
                  const reason =
                    action.key === "discontinue"
                      ? window.prompt("Discontinuation reason")?.trim()
                      : undefined;
                  if (action.key === "discontinue" && !reason) return;
                  void run(action.key, async () => {
                    const args = {
                      docId: ingredient._id,
                      version: ingredient.version,
                    };
                    if (action.key === "discontinue") {
                      await discontinue({ ...args, reason: reason! });
                    }
                    if (action.key === "reinstate") await reinstate(args);
                  });
                }}
              >
                {busy === action.key ? "Working…" : action.label}
              </button>
            ))}
          </div>
        </div>
        <dl className="culinary-facts culinary-facts-compact">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusChip status={String(ingredient.status)} />
            </dd>
          </div>
          <div>
            <dt>Unit</dt>
            <dd>{String(ingredient.unit)}</dd>
          </div>
          <div>
            <dt>Cost / unit</dt>
            <dd>{ingredient.costPerUnit}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{ingredient.category || "—"}</dd>
          </div>
          <div>
            <dt>Allergens</dt>
            <dd>
              {(ingredient.allergens ?? []).length
                ? (ingredient.allergens ?? []).join(", ")
                : "None recorded"}
            </dd>
          </div>
        </dl>
      </header>

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Recipe uses</h2>
          <span>{recipeUses.length} recipes</span>
        </div>
        {recipeUses.length ? (
          <ul className="ingredient-list">
            {recipeUses.map(({ line, recipe }) => (
              <li key={line._id}>
                <strong>
                  {line.quantity} {String(line.unit)}
                </strong>
                <CulinaryEntityLink kind="recipe" id={recipe!._id}>
                  {recipe!.name}
                </CulinaryEntityLink>
                <span>{line.prepNotes || "No preparation note"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="document-empty">
            <p>No recipes use this ingredient yet.</p>
          </div>
        )}
      </section>
    </article>
  );
}
