import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateDish,
  useDishLinkAsEdition,
  useDishMergeInto,
  useDishPurge,
  useDishReinstate,
  useGetDish,
  useGetComponent,
  useListDish,
  useListEvent,
  useListEventDish,
  useListComponent,
} from "../../lib/manifest-convex-react";
import { useTrackRecent } from "../../lib/recents";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { useUndoToast } from "../../ui/useUndoToast";
import { useActionPrompt } from "../../ui/action-prompt";
import { AllergenIconRow } from "./AllergenIconRow";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { culinaryCanonicalMatcher } from "./CulinaryCanonicalMatcher";
import { DishContainersPanel } from "./DishContainersPanel";
import { DishPrepTasksPanel } from "./DishPrepTasksPanel";
import { DishComponentsPanel } from "./DishComponentsPanel";
import { DishIngredientsPanel } from "./DishIngredientsPanel";
import { DishPrimaryImageUploader } from "../attachments/DishPrimaryImageUploader";
import { KitchenBookNav } from "./KitchenBookNav";
import { dishPath, kitchenCatalogPath, componentPath } from "./kitchenRoutes";

const policy = new CulinaryLifecyclePolicy();

export function DishDetailPage() {
  const { id } = useParams();
  const dish = useGetDish(id ?? "skip");
  useTrackRecent("Dish", dish?.name);
  const allDishes = useListDish();
  const components = useListComponent();
  const events = useListEvent();
  const eventDishes = useListEventDish();
  const purge = useDishPurge();
  const reinstate = useDishReinstate();
  const createDish = useCreateDish();
  const linkAsEdition = useDishLinkAsEdition();
  const mergeInto = useDishMergeInto();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { notifyUndo, host: undoHost } = useUndoToast();
  const { prompt, host } = useActionPrompt();

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
      {host}
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
        <p className="text-base text-ink-3">
          No customer-facing description yet.
        </p>
      )}

      <DishIngredientsPanel dishId={dish._id} />

      <DishComponentsPanel dishId={dish._id} />

      <DishPrepTasksPanel dishId={dish._id} />

      <DishContainersPanel dishId={dish._id} />

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
                <span className="font-mono text-2xs text-ink-3">
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
