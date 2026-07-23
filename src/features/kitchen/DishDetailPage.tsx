import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateDish,
  useDishLinkAsEdition,
  useDishMergeInto,
  useDishPurge,
  useDishReinstate,
  useDishSetPrimaryRecipe,
  useGetDish,
  useGetRecipe,
  useListDish,
  useListEvent,
  useListEventDish,
  useListRecipe,
} from "../../lib/manifest-convex-react";
import { useTrackRecent } from "../../lib/recents";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { useUndoToast } from "../../ui/useUndoToast";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { culinaryCanonicalMatcher } from "./CulinaryCanonicalMatcher";
import { DishPrepTasksPanel } from "./DishPrepTasksPanel";
import { DishPrimaryImageUploader } from "../attachments/DishPrimaryImageUploader";
import { KitchenBookNav } from "./KitchenBookNav";
import { dishPath, kitchenCatalogPath, recipePath } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

export function DishDetailPage() {
  const { id } = useParams();
  const dish = useGetDish(id ?? "skip");
  useTrackRecent("Dish", dish?.name);
  const allDishes = useListDish();
  const recipes = useListRecipe();
  const primaryRecipe = useGetRecipe(dish?.primaryRecipeId ?? "skip");
  const events = useListEvent();
  const eventDishes = useListEventDish();
  const purge = useDishPurge();
  const reinstate = useDishReinstate();
  const setPrimaryRecipe = useDishSetPrimaryRecipe();
  const createDish = useCreateDish();
  const linkAsEdition = useDishLinkAsEdition();
  const mergeInto = useDishMergeInto();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notifyUndo, host: undoHost } = useUndoToast();

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

  const nameMatches = culinaryCanonicalMatcher
    .findNameMatches(allDishes ?? [], dish.name, 6)
    .filter((row) => row._id !== dish._id);

  const yieldRecipe =
    primaryRecipe && primaryRecipe !== null
      ? primaryRecipe
      : (recipes?.find((recipe) => recipe._id === dish.primaryRecipeId) ??
        null);

  const actions = policy.dishActions(String(dish.status), dish.deletedAt, {
    includeRestore: true,
  });

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
    <article className="culinary-document culinary-document-compact culinary-studio">
      <Link to={kitchenCatalogPath("dishes")} className="culinary-studio-back">
        ← Dish index
      </Link>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      {undoHost}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">
              Dish · Edition {dish.editionNumber ?? 1} · Rev {dish.version}
            </p>
            <h1 className="culinary-title-compact">{dish.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <button
                key={action.key}
                className="btn btn-ghost"
                disabled={busy != null}
                onClick={() => {
                  void run(action.key, async () => {
                    const args = { docId: dish._id, version: dish.version };
                    if (action.key === "purge") {
                      await purge(args);
                      notifyUndo(`Deleted "${dish.name}"`, () =>
                        reinstate({ docId: dish._id }),
                      );
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
            <dt>Allergens</dt>
            <dd>
              <AllergenIconRow codes={dish.allergenSummary} />
            </dd>
          </div>
        </dl>
      </header>

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Primary image</h2>
        </div>
        <DishPrimaryImageUploader
          dishId={dish._id}
          dishVersion={dish.version}
          dishName={dish.name}
          storageId={dish.primaryImageStorageId}
          onError={setFailure}
        />
      </section>

      {dish.description ? (
        <p className="culinary-lead">{dish.description}</p>
      ) : (
        <p className="text-[13px] text-ink-3">
          No customer-facing description yet.
        </p>
      )}

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Production / yield</h2>
        </div>
        {yieldRecipe &&
        !("deletedAt" in yieldRecipe && yieldRecipe.deletedAt) ? (
          <dl className="culinary-facts culinary-facts-compact">
            <div>
              <dt>Primary recipe</dt>
              <dd>
                <Link
                  to={recipePath(yieldRecipe._id)}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {yieldRecipe.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Yield</dt>
              <dd>
                {yieldRecipe.yieldQuantity} {String(yieldRecipe.yieldUnit)}
              </dd>
            </div>
            <div>
              <dt>Serves per yield</dt>
              <dd>{yieldRecipe.servesPerYield}</dd>
            </div>
            <div>
              <dt>Batch multiplier</dt>
              <dd>{yieldRecipe.batchMultiplier}</dd>
            </div>
          </dl>
        ) : (
          <div className="document-empty space-y-2">
            <p>
              Yield comes from the linked primary recipe. Ingredients and
              composition live on the recipe — not on this dish.
            </p>
            <label className="field-label max-w-md">
              Link primary recipe
              <select
                className="field-input"
                disabled={busy != null}
                defaultValue=""
                onChange={(event) => {
                  const primaryRecipeId = event.target.value || undefined;
                  void run("setPrimaryRecipe", async () => {
                    await setPrimaryRecipe({
                      docId: dish._id,
                      version: dish.version,
                      primaryRecipeId,
                    });
                  });
                }}
              >
                <option value="">Select a recipe…</option>
                {(recipes ?? [])
                  .filter((recipe) => recipe.deletedAt == null)
                  .map((recipe) => (
                    <option key={recipe._id} value={recipe._id}>
                      {recipe.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        {yieldRecipe ? (
          <p className="mt-2 text-[12px] text-ink-3">
            Open the recipe to edit ingredients, instructions, and cost.{" "}
            <CulinaryEntityLink kind="recipe" id={yieldRecipe._id}>
              Go to recipe
            </CulinaryEntityLink>
          </p>
        ) : null}
      </section>

      <DishPrepTasksPanel dishId={dish._id} />

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Editions &amp; duplicates</h2>
          <span>{nameMatches.length} similar names</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={() =>
              void run("createEdition", async () => {
                const createdId = await createDish({
                  name: dish.name,
                  portionSize: dish.portionSize,
                  portionUnit: dish.portionUnit,
                  description: dish.description ?? undefined,
                  category: dish.category ?? undefined,
                  course: dish.course ?? undefined,
                  serviceStyle: dish.serviceStyle ?? undefined,
                  dietaryTags: dish.dietaryTags,
                  allergenSummary: dish.allergenSummary,
                });
                if (typeof createdId !== "string") return;
                await linkAsEdition({
                  docId: createdId,
                  sourceDishId:
                    culinaryCanonicalMatcher.resolveCanonicalId(dish),
                  editionNumber: (dish.editionNumber ?? 1) + 1,
                });
                if (dish.primaryRecipeId) {
                  await setPrimaryRecipe({
                    docId: createdId,
                    primaryRecipeId: dish.primaryRecipeId,
                  });
                }
                window.location.assign(dishPath(createdId));
              })
            }
          >
            Create new edition
          </button>
        </div>
        {nameMatches.length ? (
          <ul className="mt-3 divide-y divide-line">
            {nameMatches.map((match) => (
              <li
                key={match._id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <Link
                  to={dishPath(match._id)}
                  className="text-[13px] hover:underline"
                >
                  {match.name} · ed. {match.editionNumber ?? 1}
                </Link>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={busy != null}
                  onClick={() => {
                    const reason = window
                      .prompt(
                        `Merge "${dish.name}" into "${match.name}"? Reason`,
                      )
                      ?.trim();
                    if (!reason) return;
                    void run("mergeInto", async () => {
                      await mergeInto({
                        docId: dish._id,
                        version: dish.version,
                        targetDishId: match._id,
                        reason,
                      });
                    });
                  }}
                >
                  Merge this into that
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-ink-3">
            No similarly named dishes.
          </p>
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
                <span>{event!.title ?? event!.name}</span>
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
