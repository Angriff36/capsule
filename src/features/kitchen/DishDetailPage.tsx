import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useDishReinstate,
  useDishRetire,
  useGetDish,
  useListDishRecipe,
  useListEventDish,
  useListEvent,
  useListRecipe,
} from "../../lib/manifest-convex-react";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { KitchenBookNav } from "./KitchenBookNav";
import { kitchenCatalogPath } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

export function DishDetailPage() {
  const { id } = useParams();
  const dish = useGetDish(id ?? "skip");
  const dishRecipes = useListDishRecipe();
  const recipes = useListRecipe();
  const events = useListEvent();
  const eventDishes = useListEventDish();
  const retire = useDishRetire();
  const reinstate = useDishReinstate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  if (!id) return <ErrorState title="Dish not found" />;
  if (dish === undefined) {
    return (
      <div className="culinary-document culinary-document-compact space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  if (dish === null || dish.deletedAt != null) {
    return (
      <ErrorState
        title="Dish not found"
        detail="This dish is unavailable or no longer exists."
      />
    );
  }

  const eventUses = (eventDishes ?? [])
    .filter((entry) => entry.deletedAt == null && entry.dishId === dish._id)
    .map((entry) => ({
      entry,
      event: (events ?? []).find((event) => event._id === entry.eventId),
    }))
    .filter((row) => row.event && row.event.deletedAt == null);

  const composedRecipes = (dishRecipes ?? [])
    .filter((line) => line.deletedAt == null && line.dishId === dish._id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((line) => ({
      line,
      recipe: (recipes ?? []).find((recipe) => recipe._id === line.recipeId),
    }))
    .filter((row) => row.recipe && row.recipe.deletedAt == null);

  const actions = policy.dishActions(String(dish.status));

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
        to={kitchenCatalogPath("dishes")}
        className="text-[12px] text-ink-3 hover:text-ink"
      >
        ← Dish index
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
            <p className="eyebrow">Dish · Edition {dish.version}</p>
            <h1 className="culinary-title-compact">{dish.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                className="btn btn-ghost"
                disabled={busy != null}
                onClick={() => {
                  const reason =
                    action.key === "retire"
                      ? window.prompt("Retirement reason")?.trim()
                      : undefined;
                  if (action.key === "retire" && !reason) return;
                  void run(action.key, async () => {
                    const args = { docId: dish._id, version: dish.version };
                    if (action.key === "retire") {
                      await retire({ ...args, reason: reason! });
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
              <StatusChip status={String(dish.status)} />
            </dd>
          </div>
          <div>
            <dt>Portion</dt>
            <dd>
              {dish.portionSize} {String(dish.portionUnit)}
            </dd>
          </div>
          <div>
            <dt>Course</dt>
            <dd>{dish.course || "—"}</dd>
          </div>
          <div>
            <dt>Service</dt>
            <dd>{dish.serviceStyle || "—"}</dd>
          </div>
          <div>
            <dt>Recipes</dt>
            <dd>{composedRecipes.length || "None attached"}</dd>
          </div>
        </dl>
      </header>

      {dish.description ? (
        <p className="culinary-lead">{dish.description}</p>
      ) : null}

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Recipe composition</h2>
          <span>{composedRecipes.length} recipes</span>
        </div>
        {composedRecipes.length ? (
          <ul className="dish-uses">
            {composedRecipes.map(({ line, recipe }) => (
              <li
                key={line._id}
                className="flex items-center justify-between border-b border-line py-3"
              >
                <CulinaryEntityLink kind="recipe" id={recipe!._id}>
                  {recipe!.name}
                </CulinaryEntityLink>
                <span className="font-mono text-[10px] text-ink-3">
                  {line.role || "component"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="document-empty">
            <p>No recipes attached. A dish can include many recipes.</p>
          </div>
        )}
      </section>

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Event uses</h2>
          <span>{eventUses.length} events</span>
        </div>
        {eventUses.length ? (
          <ul className="dish-uses">
            {eventUses.map(({ entry, event }) => (
              <li
                key={entry._id}
                className="flex items-center justify-between border-b border-line py-3"
              >
                <span>{event!.name}</span>
                <span className="font-mono text-[10px] text-ink-3">
                  {entry.quantityServings} servings · {entry.course || "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="document-empty">
            <p>No events currently include this dish.</p>
          </div>
        )}
      </section>
    </article>
  );
}
