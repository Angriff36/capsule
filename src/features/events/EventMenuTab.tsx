import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishChangeCourse,
  useEventDishRemove,
  useGetEvent,
  useListComponent,
  useListComponentIngredient,
  useListDish,
  useListDishComponent,
  useListDishContainer,
  useListDishIngredient,
  useListEventDish,
  useListIngredient,
  useListIngredientPriceObservation,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { AllergenIconRow } from "../kitchen/AllergenIconRow";
import { CulinaryRecordPicker } from "../kitchen/CulinaryRecordPicker";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { dishPath } from "../kitchen/kitchenRoutes";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";
import { ComponentStockSuggestions } from "./ComponentStockSuggestions";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventMenuRecipeEditor } from "./EventMenuRecipeEditor";
import { buildEventMenuCost, eventMenuCostForDish } from "./eventMenuCost";
import { eventMenuContainerCountsForDish } from "./eventMenuContainers";

type Props = {
  eventId: string;
  expectedHeadcount: number;
};

export function EventMenuTab({ eventId, expectedHeadcount }: Props) {
  const event = useGetEvent(eventId);
  const dishes = useListDish();
  const eventDishes = useListEventDish();
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const containers = useListDishContainer();
  const createEventDish = useCreateEventDish();
  const adjustServings = useEventDishAdjustServings();
  const changeCourse = useEventDishChangeCourse();
  const removeDish = useEventDishRemove();
  const { ready: prepSyncReady, syncStockForEvent } = useEventMenuSync();
  const [showPicker, setShowPicker] = useState(false);
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const selections = useMemo(
    () =>
      (eventDishes ?? [])
        .filter((item) => item.deletedAt == null && item.eventId === eventId)
        .sort((a, b) =>
          String(a.course ?? "").localeCompare(String(b.course ?? "")),
        ),
    [eventDishes, eventId],
  );
  const existingDishIds = selections.map((row) => row.dishId);

  const costRollup = useMemo(
    () =>
      buildEventMenuCost({
        eventId,
        expectedHeadcount,
        eventDishes: selections.map((row) => ({
          id: row._id,
          eventId: row.eventId,
          dishId: row.dishId,
          quantityServings: Number(row.quantityServings),
          headcountOverride: Number(
            (row as { headcountOverride?: number }).headcountOverride ?? 0,
          ),
          deletedAt: row.deletedAt,
        })),
        dishIngredients: (dishIngredients ?? []).map((row) => ({
          id: row._id,
          dishId: row.dishId,
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: String(row.unit),
          wasteFactor: row.wasteFactor,
          addedAt: row.addedAt,
          deletedAt: row.deletedAt,
        })),
        dishComponents: (dishComponents ?? []).map((row) => ({
          id: row._id,
          dishId: row.dishId,
          componentId: row.componentId,
          yieldQuantity: Number(row.yieldQuantity),
          batchMultiplier: Number(row.batchMultiplier),
          deletedAt: row.deletedAt,
        })),
        components: (components ?? []).map((row) => ({
          id: row._id,
          yieldQuantity: Number(row.yieldQuantity),
          deletedAt: row.deletedAt,
        })),
        componentIngredients: (componentIngredients ?? []).map((row) => ({
          id: row._id,
          componentId: row.componentId,
          ingredientId: row.ingredientId,
          quantity: Number(row.quantity),
          unit: String(row.unit),
          deletedAt: row.deletedAt,
        })),
        ingredients: (ingredients ?? []).map((row) => ({
          id: row._id,
          name: row.name,
          unit: String(row.unit),
          costPerUnit: Number(row.costPerUnit),
          deletedAt: row.deletedAt,
        })),
        priceObservations: priceObservations ?? [],
      }),
    [
      componentIngredients,
      components,
      dishComponents,
      dishIngredients,
      eventId,
      expectedHeadcount,
      ingredients,
      priceObservations,
      selections,
    ],
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(classifyCommandFailure(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-4" data-testid="event-menu-tab">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg">Event menu</h2>
          <p className="text-base text-ink-2">
            Customer-facing dishes for this event — images, allergens, cost, and
            pans.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy != null}
          onClick={() => setShowPicker((value) => !value)}
        >
          {showPicker ? "Hide picker" : "Add dish"}
        </button>
      </div>
      {selections.length > 0 ? (
        <p
          className="font-mono text-sm text-ink-2"
          data-testid="event-menu-food-cost"
        >
          Food cost {formatMoneyExact(costRollup.foodCost)}
          {" · "}
          {formatMoneyExact(costRollup.costPerServing)} / serving
          {" · "}
          {costRollup.servings} servings
        </p>
      ) : null}
      {costRollup.mismatches.length > 0 ? (
        <div
          className="border border-danger/40 bg-danger/5 p-3 text-sm text-danger"
          data-testid="event-menu-unit-mismatch"
          role="status"
        >
          {costRollup.mismatches.map((row) => (
            <p key={`${row.dishId}:${row.ingredientId}`}>{row.message}</p>
          ))}
        </div>
      ) : null}
      {failure ? <FailureBanner failure={failure} /> : null}
      {host}
      <ComponentStockSuggestions />
      <EventDraftPoButton
        eventId={eventId}
        eventStage={String(event?.stage ?? "planning")}
      />
      {showPicker ? (
        <CulinaryRecordPicker
          kind="dish"
          records={(dishes ?? []).map((dish) => ({
            _id: dish._id,
            name: dish.name,
            description: dish.description,
            allergenSummary: dish.allergenSummary,
            primaryImageStorageId: dish.primaryImageStorageId,
            editionNumber: dish.editionNumber,
            deletedAt: dish.deletedAt,
            status: String(dish.status),
            mergedIntoDishId: dish.mergedIntoDishId,
            canonicalDishId: dish.canonicalDishId,
          }))}
          excludeIds={existingDishIds}
          onSelect={(dishId) =>
            void run("add", async () => {
              const servings = Math.max(1, expectedHeadcount || 1);
              await createEventDish({
                eventId,
                dishId,
                quantityServings: servings,
                headcountOverride: 0,
              });
              if (prepSyncReady) {
                await syncStockForEvent(eventId);
              }
              setShowPicker(false);
            })
          }
          onCreateNew={() =>
            setFailure(
              classifyCommandFailure(
                new Error(
                  "Create dishes in Kitchen → Dishes, then add them here.",
                ),
              ),
            )
          }
        />
      ) : null}

      {selections.length === 0 ? (
        <div className="document-empty">
          <p>
            No dishes on this event yet. Add a dish to build the menu guests
            will see.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {selections.map((selection) => {
            const dish = dishes?.find((row) => row._id === selection.dishId);
            const dishCost = eventMenuCostForDish(costRollup, selection._id);
            const estimated = dishCost?.foodCost ?? 0;
            const pans = eventMenuContainerCountsForDish(
              selection.dishId,
              dishCost?.servings ?? Number(selection.quantityServings),
              (containers ?? []).map((row) => ({
                id: row._id,
                dishId: row.dishId,
                name: row.name,
                servingsPerContainer: Number(row.servingsPerContainer),
                baseQuantity: Number(row.baseQuantity ?? 0),
                status: String(row.status),
                deletedAt: row.deletedAt,
              })),
            );
            const panLabel = pans
              .map((row) => `${row.count} ${row.name}`)
              .join(" · ");
            return (
              <li
                key={selection._id}
                className="flex flex-wrap gap-4 border border-line bg-panel p-3"
              >
                <DishPrimaryImage
                  storageId={dish?.primaryImageStorageId}
                  alt={dish?.name ?? "Dish"}
                  size="thumb"
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={dish ? dishPath(dish._id) : "#"}
                      className="text-lg font-semibold hover:underline"
                    >
                      {dish?.name ?? "Unknown dish"}
                    </Link>
                    <AllergenIconRow codes={dish?.allergenSummary} />
                  </div>
                  <p className="text-base text-ink-2">
                    {dish?.description || "No description yet."}
                  </p>
                  <p className="font-mono text-xs text-ink-3">
                    {selection.course || "Uncategorized"}
                    {" · "}
                    {selection.quantityServings} servings
                    {" · est. "}
                    {estimated > 0 ? formatMoneyExact(estimated) : "—"}
                    {panLabel ? ` · ${panLabel}` : ""}
                  </p>
                  {dishCost && dishCost.mismatches.length > 0 ? (
                    <p className="text-sm text-danger">
                      {dishCost.mismatches[0]?.message}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setOpenRecipeId((current) =>
                        current === selection._id ? null : selection._id,
                      )
                    }
                  >
                    {openRecipeId === selection._id
                      ? "Hide recipe"
                      : "Edit recipe on this menu"}
                  </button>
                  {openRecipeId === selection._id ? (
                    <EventMenuRecipeEditor
                      dishId={selection.dishId}
                      servings={
                        dishCost?.servings ?? Number(selection.quantityServings)
                      }
                    />
                  ) : null}
                </div>
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                    formEvent.preventDefault();
                    const data = new FormData(formEvent.currentTarget);
                    const quantityServings = Number(
                      data.get("quantityServings"),
                    );
                    if (
                      !Number.isFinite(quantityServings) ||
                      quantityServings < 0
                    )
                      return;
                    const nextCourse = String(data.get("course") ?? "").trim();
                    const prevCourse = String(selection.course ?? "").trim();
                    void run(`servings:${selection._id}`, async () => {
                      let version = selection.version;
                      if (nextCourse !== prevCourse) {
                        await changeCourse({
                          docId: selection._id,
                          version,
                          course: nextCourse || undefined,
                          serviceStyle:
                            String(selection.serviceStyle ?? "").trim() ||
                            undefined,
                        });
                        version += 1;
                      }
                      if (quantityServings !== selection.quantityServings) {
                        await adjustServings({
                          docId: selection._id,
                          version,
                          quantityServings,
                        });
                      }
                    });
                  }}
                >
                  <label className="field-label">
                    Course
                    <input
                      className="field-input w-36"
                      name="course"
                      defaultValue={selection.course ?? ""}
                      placeholder="Uncategorized"
                    />
                  </label>
                  <label className="field-label">
                    Servings
                    <input
                      className="field-input w-24"
                      name="quantityServings"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={selection.quantityServings}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn btn-ghost"
                    disabled={busy != null}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busy != null}
                    onClick={() => {
                      void (async () => {
                        const reason = await prompt.askReason({
                          ...ReasonCopy.removeLine,
                          title: "Remove event dish",
                          description:
                            "Record why this dish is leaving the event menu.",
                          confirmLabel: "Remove dish",
                          tone: "danger",
                        });
                        if (!reason) return;
                        void run(`remove:${selection._id}`, () =>
                          removeDish({
                            docId: selection._id,
                            version: selection.version,
                            reason,
                          }),
                        );
                      })();
                    }}
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
