import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateDish,
  useDishDetachVersion,
  useDishLabelVersion,
  useDishLinkAsEdition,
  useDishMakeVersionOf,
  useDishMergeInto,
  useDishPurge,
  useDishReinstate,
  useGetDish,
} from "../../lib/manifest-convex-react";
import { useWholeDishList } from "../../lib/useDishesByIds";
import { useEventsById } from "../facilities/useEventsById";
import { useMenuLinesForDish } from "../facilities/useMenuLinesFor";
import { useTrackRecent } from "../../lib/recents";
import { useRouteRecord } from "../../lib/routeRecord";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { useUndoToast } from "../../ui/useUndoToast";
import { useActionPrompt } from "../../ui/action-prompt";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { CulinaryRecordPicker } from "./CulinaryRecordPicker";
import {
  VERSION_NAME_SUGGESTIONS,
  mainDishIdOf,
  mainDishRows,
  versionTabLabel,
  versionTabs,
} from "./dishVersions";
import { culinaryCanonicalMatcher } from "./CulinaryCanonicalMatcher";
import { DishContainersPanel } from "./DishContainersPanel";
import { DishDetailsEditor } from "./DishDetailsEditor";
import { DishPrepTasksPanel } from "./DishPrepTasksPanel";
import { DishComponentsPanel } from "./DishComponentsPanel";
import { DishComponentPortionSpecPanel } from "./DishComponentPortionSpecPanel";
import { DishIngredientsPanel } from "./DishIngredientsPanel";
import { DishPlateCostFact } from "./DishPlateCostFact";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { RecipeNotes } from "./RecipeNotes";
import "./DishRecipe.css";
import { DishPrimaryImageUploader } from "../attachments/DishPrimaryImageUploader";
import { KitchenBookNav } from "./KitchenBookNav";
import { dishPath, kitchenCatalogPath, componentPath } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

export function DishDetailPage() {
  const { id } = useParams();
  const dish = useRouteRecord(useGetDish, id);
  useTrackRecent("Dish", dish?.name);
  const allDishes = useWholeDishList();
  const eventDishes = useMenuLinesForDish(dish?._id);
  const events = useEventsById(
    dish === undefined || eventDishes === undefined
      ? undefined
      : eventDishes
          .filter((entry) => entry.dishId === dish?._id)
          .map((entry) => entry.eventId),
  );
  const purge = useDishPurge();
  const reinstate = useDishReinstate();
  const createDish = useCreateDish();
  const linkAsEdition = useDishLinkAsEdition();
  const mergeInto = useDishMergeInto();
  const makeVersionOf = useDishMakeVersionOf();
  const labelVersion = useDishLabelVersion();
  const detachVersion = useDishDetachVersion();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notifyUndo, host: undoHost } = useUndoToast();
  const { prompt, host } = useActionPrompt();
  const { loadingTooLong } = useSlowQuery(dish);

  if (!id) return <ErrorState title="Dish not found" />;
  if (dish === undefined) {
    if (loadingTooLong) {
      return (
        <QueryLoadState
          title="This dish isn't loading"
          detail="We couldn't load this dish. Check your connection, then refresh the page."
          loadingTooLong
        />
      );
    }
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

  // Versions: the main dish and its versions show as tabs on every one of them.
  const tabs = allDishes ? versionTabs(allDishes, dish) : [];
  const mainId = allDishes ? mainDishIdOf(allDishes, dish) : dish._id;
  const main = tabs[0] ?? dish;
  const isVersion = mainId !== dish._id;
  const hasVersions = tabs.length > 1;

  const askVersionName = async (title: string, defaultValue = "") =>
    (
      await prompt.askFields({
        title,
        description:
          "Name the way this dish is served, for example Finish at Kitchen or Drop Off.",
        fields: [
          {
            name: "label",
            label: "Version name",
            defaultValue,
            suggestions: VERSION_NAME_SUGGESTIONS,
            required: true,
          },
        ],
        confirmLabel: "Save",
      })
    )?.label?.trim() ?? "";

  const addVersion = () =>
    void (async () => {
      const label = await askVersionName(`Add a version of ${main.name}`);
      if (!label) return;
      await run("addVersion", async () => {
        const created = (await createDish({
          name: `${main.name} - ${label}`,
          portionSize: main.portionSize,
          portionUnit: main.portionUnit,
          description: main.description ?? undefined,
          category: main.category ?? undefined,
          course: main.course ?? undefined,
          serviceStyle: main.serviceStyle ?? undefined,
          dietaryTags: main.dietaryTags,
          allergenSummary: main.allergenSummary,
        })) as string | { docId: string } | undefined;
        const createdId =
          typeof created === "string" ? created : created?.docId;
        if (!createdId) return;
        await makeVersionOf({ docId: createdId, mainDishId: mainId, label });
        navigate(dishPath(createdId));
      });
    })();

  const renameTab = () =>
    void (async () => {
      const label = await askVersionName(
        "Rename this tab",
        dish.versionLabel ?? "",
      );
      if (!label) return;
      await run("renameTab", async () => {
        await labelVersion({ docId: dish._id, version: dish.version, label });
      });
    })();

  const makeOwnDish = () =>
    void run("detachVersion", async () => {
      await detachVersion({ docId: dish._id, version: dish.version });
    });

  const joinMainDish = (mainDishId: string) =>
    void (async () => {
      const label = await askVersionName(
        "Make this a version",
        dish.versionLabel ?? "",
      );
      if (!label) return;
      await run("makeVersionOf", async () => {
        await makeVersionOf({
          docId: dish._id,
          version: dish.version,
          mainDishId,
          label,
        });
      });
    })();

  return (
    <article className="culinary-document culinary-document-compact dish-recipe">
      <Link
        to={kitchenCatalogPath("dishes")}
        className="culinary-studio-back relative z-[2]"
      >
        ← Dishes
      </Link>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      {undoHost}
      {host}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">
              Dish · Edition {dish.editionNumber ?? 1} · Rev {dish.version}
            </p>
            <h1 className="dish-recipe-title">{dish.name}</h1>
          </div>
          <details className="recipe-management">
            <summary>Dish actions</summary>
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
          </details>
        </div>
        <dl className="dish-recipe-facts">
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
          <DishPlateCostFact dishId={dish._id} />
          <div>
            <dt>Category</dt>
            <dd>{dish.category || "—"}</dd>
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
          <div>
            <dt>Dietary</dt>
            <dd data-testid="dish-dietary-tags">
              {dish.dietaryTags && dish.dietaryTags.length > 0
                ? dish.dietaryTags.join(", ")
                : "—"}
            </dd>
          </div>
        </dl>
      </header>

      <section className="dish-versions" aria-label="Versions">
        {hasVersions ? (
          <nav className="dish-version-tabs" role="tablist">
            {tabs.map((tab) => (
              <Link
                key={tab._id}
                to={dishPath(tab._id)}
                role="tab"
                aria-selected={tab._id === dish._id}
                className={tab._id === dish._id ? "is-active" : undefined}
              >
                {versionTabLabel(tab)}
              </Link>
            ))}
          </nav>
        ) : null}
        <details className="recipe-management">
          <summary>Versions</summary>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy != null || allDishes === undefined}
              onClick={addVersion}
            >
              {busy === "addVersion" ? "Working…" : "Add a version"}
            </button>
            {hasVersions ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy != null}
                onClick={renameTab}
              >
                Rename this tab
              </button>
            ) : null}
            {isVersion ? (
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy != null}
                onClick={makeOwnDish}
              >
                {busy === "detachVersion" ? "Working…" : "Make it its own dish"}
              </button>
            ) : null}
          </div>
          {!isVersion && !hasVersions && allDishes ? (
            <div className="mt-3">
              <p className="mb-2 text-sm text-ink-2">
                Make this a version of another dish:
              </p>
              <CulinaryRecordPicker
                kind="dish"
                label="Search main dishes"
                records={mainDishRows(allDishes)
                  .filter((row) => row._id !== dish._id)
                  .map((row) => ({
                    _id: row._id,
                    name: row.name,
                    description: row.description,
                    allergenSummary: row.allergenSummary,
                    primaryImageStorageId: row.primaryImageStorageId,
                    editionNumber: row.editionNumber,
                    deletedAt: row.deletedAt,
                    status: String(row.status),
                    mergedIntoDishId: row.mergedIntoDishId,
                    canonicalDishId: row.canonicalDishId,
                  }))}
                onSelect={joinMainDish}
              />
            </div>
          ) : null}
        </details>
      </section>

      {dish.description ? (
        <p className="culinary-lead">{dish.description}</p>
      ) : (
        <p className="text-base text-ink-3">
          No customer-facing description yet.
        </p>
      )}

      {dish.primaryImageStorageId ? (
        <DishPrimaryImage
          storageId={dish.primaryImageStorageId}
          alt={dish.name}
          size="hero"
          className="mt-4"
        />
      ) : null}
      <details className="recipe-add-editor">
        <summary>
          {dish.primaryImageStorageId ? "Edit photo" : "Add photo"}
        </summary>
        <DishPrimaryImageUploader
          dishId={dish._id}
          dishVersion={dish.version}
          dishName={dish.name}
          storageId={dish.primaryImageStorageId}
          onError={setFailure}
        />
      </details>

      <details className="recipe-add-editor">
        <summary>Edit dish</summary>
        <DishDetailsEditor
          key={`${dish._id}:${dish.version}`}
          dish={{
            _id: dish._id,
            version: dish.version,
            name: dish.name,
            description: dish.description,
            category: dish.category,
            course: dish.course,
            serviceStyle: dish.serviceStyle,
            dietaryTags: dish.dietaryTags,
            portionSize: Number(dish.portionSize),
            portionUnit: String(dish.portionUnit),
            serviceInstructions: dish.serviceInstructions,
            serviceInstructionsSource: dish.serviceInstructionsSource,
            allergenSummary: dish.allergenSummary,
            kind: dish.kind,
            status: String(dish.status),
          }}
          onFailure={setFailure}
        />
      </details>

      {dish.recipeInstructions ? (
        <section className="culinary-section">
          <div className="flex flex-wrap items-center gap-3.5">
            <h2 className="text-sm font-bold uppercase tracking-[0.09em] text-ink">
              Recipe
            </h2>
            <i aria-hidden="true" className="h-px flex-1 bg-ink" />
            <span className="text-sm text-ink-3">
              Recipe yield: {dish.recipeSourceYield}
            </span>
          </div>
          <RecipeNotes text={dish.recipeInstructions} />
        </section>
      ) : null}

      <DishIngredientsPanel dishId={dish._id} />

      <DishPrepTasksPanel dishId={dish._id} />

      <DishComponentsPanel dishId={dish._id} />

      <DishComponentPortionSpecPanel dishId={dish._id} />

      <DishContainersPanel dishId={dish._id} />

      <details className="recipe-management recipe-record-history">
        <summary>Editions &amp; duplicates ({nameMatches.length})</summary>
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
                    className="text-base hover:underline"
                  >
                    {match.name} · ed. {match.editionNumber ?? 1}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy != null}
                    onClick={() => {
                      void (async () => {
                        const reason = (
                          await prompt.askReason({
                            title: "Merge dishes",
                            description: `Merge "${dish.name}" into "${match.name}".`,
                            label: "Reason",
                            confirmLabel: "Merge dishes",
                            tone: "danger",
                          })
                        )?.trim();
                        if (!reason) return;
                        await run("mergeInto", async () => {
                          await mergeInto({
                            docId: dish._id,
                            version: dish.version,
                            targetDishId: match._id,
                            reason,
                          });
                        });
                      })();
                    }}
                  >
                    Merge this into that
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-base text-ink-3">
              No similarly named dishes.
            </p>
          )}
        </section>
      </details>

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Event uses</h2>
          <span>{formatCountNoun(eventUses.length, "event")}</span>
        </div>
        {eventUses.length ? (
          <ul className="dish-uses">
            {eventUses.map(({ entry, event }) => (
              <li
                key={entry._id}
                className="flex items-center justify-between border-b border-line py-3"
              >
                <span>{event!.title}</span>
                <span className="font-mono text-sm text-ink-3">
                  {entry.quantityServings} servings · {entry.course || "—"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="recipe-empty">
            <p>No events currently include this dish.</p>
          </div>
        )}
      </section>
    </article>
  );
}
