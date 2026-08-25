import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishChangeCourse,
  useEventDishRemove,
  useEventDishSetHeadcountOverride,
  useEventDishUpdateInstructions,
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
  useListInventoryItem,
  useListInventoryReservation,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { AllergenIconRow } from "../kitchen/AllergenIconRow";
import { ComponentNutritionPanel } from "../kitchen/ComponentNutritionPanel";
import { CulinaryRecordPicker } from "../kitchen/CulinaryRecordPicker";
import { EventMenuStockShortageBanner } from "../kitchen/EventMenuStockShortageBanner";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { dishPath } from "../kitchen/kitchenRoutes";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { ActionMenu, ActionMenuRule } from "../../ui/primitives";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import type { EventStockShortage } from "./EventStockReservationCoordinator";
import { FailureBanner } from "./FailureBanner";
import { ComponentStockSuggestions } from "./ComponentStockSuggestions";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventMenuRecipeEditor } from "./EventMenuRecipeEditor";
import {
  buildEventMenuCost,
  eventMenuCostForDish,
  eventMenuDishEstimateKind,
  eventMenuHeaderUnpricedNote,
  eventMenuUnpricedEstimateLabel,
} from "./eventMenuCost";
import {
  eventMenuContainerCountsForDish,
  eventMenuLinePanCount,
  eventMenuPansInputValue,
} from "./eventMenuContainers";
import {
  eventMenuSellTotals,
  formatEventMenuSellInput,
} from "./eventMenuSellPrice";
import {
  parseEventMenuLineFields,
  planEventMenuLineSave,
} from "./eventMenuLineFields";
import { suspectRowsFromRecipeLines } from "./eventMenuSuspectQuantity";
import { useEventMenuNutrition } from "./useEventMenuNutrition";

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
  const inventoryItems = useListInventoryItem();
  const inventoryReservations = useListInventoryReservation();
  const createEventDish = useCreateEventDish();
  const adjustServings = useEventDishAdjustServings();
  const changeCourse = useEventDishChangeCourse();
  const removeDish = useEventDishRemove();
  const setHeadcountOverride = useEventDishSetHeadcountOverride();
  const updateInstructions = useEventDishUpdateInstructions();
  const { ready: prepSyncReady, syncStockForEvent } = useEventMenuSync();
  const [showPicker, setShowPicker] = useState(false);
  const [stockShortages, setStockShortages] = useState<EventStockShortage[]>(
    [],
  );
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

  const nutrition = useEventMenuNutrition(existingDishIds);

  const refreshStock = async () => {
    if (!prepSyncReady) return;
    setStockShortages(await syncStockForEvent(eventId));
  };

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

  const sellRollup = useMemo(
    () =>
      eventMenuSellTotals(
        selections.map((row) => {
          const fields = parseEventMenuLineFields(row.specialInstructions);
          return {
            eventDishId: row._id,
            dishId: row.dishId,
            name:
              dishes?.find((dish) => dish._id === row.dishId)?.name ??
              "Unknown dish",
            servings: Number(row.quantityServings),
            unitSellPrice: fields.unitSellPrice,
            specialInstructions: row.specialInstructions,
          };
        }),
      ),
    [dishes, selections],
  );

  const headerUnpricedNote = eventMenuHeaderUnpricedNote(costRollup);

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

  const unpricedCount = costRollup.dishes.filter(
    (line) => eventMenuDishEstimateKind(line) !== "priced",
  ).length;

  return (
    <section className="space-y-5" data-testid="event-menu-tab">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Event menu</h2>
          <p className="text-sm text-ink-2">
            Dishes guests will see — course, servings, price, and pans per line.
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
        <div
          className="card grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0"
          data-testid="event-menu-food-cost"
        >
          <CostFigure
            label="Food cost"
            value={formatMoneyExact(costRollup.foodCost)}
            note={
              sellRollup.foodSellTotal > 0
                ? `food sell ${formatMoneyExact(sellRollup.foodSellTotal)}`
                : undefined
            }
          />
          <CostFigure
            label="Cost per serving"
            value={formatMoneyExact(costRollup.costPerServing)}
            note={headerUnpricedNote ?? undefined}
            warn={headerUnpricedNote != null}
          />
          <CostFigure
            label="Servings"
            value={String(costRollup.servings)}
            note={
              unpricedCount > 0
                ? `${unpricedCount} ${unpricedCount === 1 ? "dish" : "dishes"} without a priced recipe`
                : `${selections.length} ${selections.length === 1 ? "dish" : "dishes"} on the menu`
            }
            warn={unpricedCount > 0}
          />
        </div>
      ) : null}
      {costRollup.mismatches.length > 0 ? (
        <div
          className="banner banner-danger"
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
      <EventMenuStockShortageBanner
        shortages={stockShortages}
        ingredients={(ingredients ?? []).map((ingredient) => ({
          id: ingredient._id,
          name: ingredient.name,
          unit: String(ingredient.unit),
          costPerUnit: Number(ingredient.costPerUnit),
          allergens: ingredient.allergens ?? [],
          status: String(ingredient.status),
          substituteIngredientIds: ingredient.substituteIngredientIds,
          deletedAt: ingredient.deletedAt,
        }))}
        inventoryItems={(inventoryItems ?? []).map((item) => ({
          id: item._id,
          ingredientId: item.ingredientId,
          quantityOnHand: Number(item.quantityOnHand),
          unit: String(item.unit),
          stockedAt: item.stockedAt,
          deletedAt: item.deletedAt,
        }))}
        reservations={(inventoryReservations ?? []).map((reservation) => ({
          inventoryItemId: reservation.inventoryItemId,
          quantity: Number(reservation.quantity),
          status: String(reservation.status),
          deletedAt: reservation.deletedAt,
        }))}
        onDismiss={() => setStockShortages([])}
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
              await refreshStock();
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
        <div className="card px-5 py-10 text-center">
          <p className="text-base font-semibold text-ink">
            No dishes on this event yet
          </p>
          <p className="mt-1 text-sm text-ink-2">
            Add a dish to build the menu guests will see.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-4"
            disabled={busy != null}
            onClick={() => setShowPicker(true)}
          >
            Add dish
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {selections.map((selection) => {
            const dish = dishes?.find((row) => row._id === selection.dishId);
            const dishCost = eventMenuCostForDish(costRollup, selection._id);
            const estimated = dishCost?.foodCost ?? 0;
            const estimateKind = eventMenuDishEstimateKind(dishCost);
            const dishContainers = (containers ?? []).map((row) => ({
              id: row._id,
              dishId: row.dishId,
              name: row.name,
              servingsPerContainer: Number(row.servingsPerContainer),
              baseQuantity: Number(row.baseQuantity ?? 0),
              status: String(row.status),
              deletedAt: row.deletedAt,
            }));
            const servings =
              dishCost?.servings ?? Number(selection.quantityServings);
            const lineFields = parseEventMenuLineFields(
              selection.specialInstructions,
            );
            const pans = eventMenuContainerCountsForDish(
              selection.dishId,
              servings,
              dishContainers,
            );
            const linePanCount = eventMenuLinePanCount(
              lineFields.containerCount,
              servings,
              selection.dishId,
              dishContainers,
            );
            const panLabel =
              lineFields.containerCount != null
                ? `${linePanCount} pans`
                : pans.map((row) => `${row.count} ${row.name}`).join(" · ");
            const recipeFlags = suspectRowsFromRecipeLines(
              (dishIngredients ?? [])
                .filter(
                  (line) =>
                    line.deletedAt == null && line.dishId === selection.dishId,
                )
                .map((line) => ({
                  name:
                    ingredients?.find((row) => row._id === line.ingredientId)
                      ?.name ?? "",
                  unit: String(line.unit),
                  quantity: Number(line.quantity),
                  prepNotes:
                    (line as { prepNotes?: string | null }).prepNotes ?? null,
                })),
              servings,
            );
            const recipeOpen = openRecipeId === selection._id;
            return (
              <li key={selection._id} className="card">
                <form
                  key={`${selection._id}:${selection.version}`}
                  className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
                  onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                    formEvent.preventDefault();
                    const data = new FormData(formEvent.currentTarget);
                    const plan = planEventMenuLineSave({
                      currentInstructions: selection.specialInstructions,
                      currentServings: Number(selection.quantityServings),
                      nextSellRaw: String(data.get("unitSellPrice") ?? ""),
                      nextServingsRaw: String(
                        data.get("quantityServings") ?? "",
                      ),
                      nextContainerRaw: String(
                        data.get("containerCount") ?? "",
                      ),
                    });
                    if (
                      !Number.isFinite(plan.quantityServings) ||
                      plan.quantityServings < 0
                    )
                      return;
                    const nextCourse = String(data.get("course") ?? "").trim();
                    const prevCourse = String(selection.course ?? "").trim();
                    void run(`servings:${selection._id}`, async () => {
                      let version = selection.version;
                      if (plan.fieldsChanged) {
                        await updateInstructions({
                          docId: selection._id,
                          version,
                          specialInstructions:
                            plan.specialInstructions || undefined,
                        });
                        version += 1;
                      }
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
                      if (plan.servingsChanged) {
                        await adjustServings({
                          docId: selection._id,
                          version,
                          quantityServings: plan.quantityServings,
                        });
                        version += 1;
                        if (plan.quantityServings > 0) {
                          await setHeadcountOverride({
                            docId: selection._id,
                            version,
                            headcountOverride: plan.quantityServings,
                          });
                        }
                      }
                    });
                  }}
                >
                  <div className="flex min-w-0 gap-4">
                    <DishPrimaryImage
                      storageId={dish?.primaryImageStorageId}
                      alt={dish?.name ?? "Dish"}
                      size="thumb"
                      className="h-16 w-16 shrink-0 rounded-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          to={dish ? dishPath(dish._id) : "#"}
                          className="text-lg font-semibold text-ink hover:underline"
                        >
                          {dish?.name ?? "Unknown dish"}
                        </Link>
                        <span className="chip border-line-2 bg-inset text-ink-2">
                          {selection.course || "Uncategorized"}
                        </span>
                        <AllergenIconRow codes={dish?.allergenSummary} />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-ink-2">
                        {dish?.description || "No description yet."}
                      </p>
                      <p className="mt-1 text-sm font-medium text-ink-2">
                        {selection.quantityServings} servings
                        {" · est. "}
                        <span className="text-ink">
                          {estimateKind === "priced"
                            ? formatMoneyExact(estimated)
                            : eventMenuUnpricedEstimateLabel(estimateKind)}
                        </span>
                        {(() => {
                          const sell = sellRollup.lines.find(
                            (line) => line.eventDishId === selection._id,
                          );
                          return sell?.unitSellPrice != null
                            ? ` · sell ${formatMoneyExact(sell.sellTotal)}`
                            : "";
                        })()}
                        {panLabel ? ` · ${panLabel}` : ""}
                      </p>
                      {dishCost && dishCost.mismatches.length > 0 ? (
                        <p className="mt-1 text-sm font-medium text-danger">
                          {dishCost.mismatches[0]?.message}
                        </p>
                      ) : null}
                      {recipeFlags.map((row) => (
                        <p
                          key={`${row.name}:${row.quantity}:${row.unit}`}
                          className="mt-1 text-sm font-medium text-danger"
                          data-testid="suspect-prep-quantity"
                        >
                          {row.flag}
                        </p>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto_auto] sm:items-end">
                    <label className="field-label col-span-2 sm:col-span-1">
                      Course
                      <input
                        className="field-input sm:w-36"
                        name="course"
                        defaultValue={selection.course ?? ""}
                        placeholder="Uncategorized"
                      />
                    </label>
                    <label className="field-label">
                      Sell / serving
                      <input
                        className="field-input sm:w-24"
                        name="unitSellPrice"
                        type="number"
                        min={0}
                        step="0.01"
                        data-testid="event-menu-unit-sell-price"
                        defaultValue={formatEventMenuSellInput(
                          lineFields.unitSellPrice,
                        )}
                      />
                    </label>
                    <label className="field-label">
                      Servings
                      <input
                        className="field-input sm:w-24"
                        name="quantityServings"
                        type="number"
                        min={0}
                        step={1}
                        data-testid="event-menu-servings"
                        defaultValue={selection.quantityServings}
                      />
                    </label>
                    <label className="field-label">
                      Pans
                      <input
                        className="field-input sm:w-20"
                        name="containerCount"
                        type="number"
                        min={0}
                        step={1}
                        data-testid="event-menu-line-pans"
                        defaultValue={eventMenuPansInputValue(
                          lineFields.containerCount,
                          linePanCount,
                        )}
                      />
                    </label>
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      disabled={busy != null}
                    >
                      Save
                    </button>
                    <ActionMenu>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenRecipeId((current) =>
                            current === selection._id ? null : selection._id,
                          )
                        }
                      >
                        {recipeOpen
                          ? "Hide recipe"
                          : "Edit recipe on this menu"}
                      </button>
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={() => {
                          void (async () => {
                            const current =
                              Number(
                                (selection as { headcountOverride?: number })
                                  .headcountOverride,
                              ) || 0;
                            const values = await prompt.askFields({
                              title: "Food-cost headcount",
                              description:
                                "Guests this dish is costed for. 0 uses the event guest count.",
                              fields: [
                                {
                                  name: "headcountOverride",
                                  label: "Headcount override",
                                  defaultValue: String(current),
                                  inputType: "number",
                                  required: true,
                                },
                              ],
                              confirmLabel: "Save headcount",
                            });
                            if (!values) return;
                            const override = Number(values.headcountOverride);
                            if (!Number.isFinite(override) || override < 0)
                              return;
                            void run(`override:${selection._id}`, () =>
                              setHeadcountOverride({
                                docId: selection._id,
                                version: selection.version,
                                headcountOverride: override,
                              }),
                            );
                          })();
                        }}
                      >
                        Set food-cost headcount
                      </button>
                      <ActionMenuRule />
                      <button
                        type="button"
                        className="action-menu-danger"
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
                        Remove from menu
                      </button>
                    </ActionMenu>
                  </div>
                </form>
                {recipeOpen ? (
                  <div className="border-t border-line p-4">
                    <EventMenuRecipeEditor
                      dishId={selection.dishId}
                      servings={
                        dishCost?.servings ?? Number(selection.quantityServings)
                      }
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ComponentNutritionPanel
        heading="Per-guest nutrition"
        portionLabel="per guest"
        totals={
          nutrition.totals.componentCount > 0 ? nutrition.totals.perGuest : null
        }
        coverageNote={nutrition.coverageNote}
        loading={nutrition.loading}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <ComponentStockSuggestions />
        <div className="card p-4">
          <p className="text-base font-semibold text-ink">Purchasing</p>
          <p className="mb-3 text-sm text-ink-2">
            Turn this menu's ingredient needs into a vendor order.
          </p>
          <EventDraftPoButton
            eventId={eventId}
            eventStage={String(event?.stage ?? "planning")}
          />
        </div>
      </div>
    </section>
  );
}

function CostFigure({
  label,
  value,
  note,
  warn = false,
}: {
  label: string;
  value: string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs font-semibold tracking-[0.04em] text-ink-2 uppercase">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
      {note ? (
        <p className={`mt-0.5 text-sm ${warn ? "text-warn" : "text-ink-2"}`}>
          {note}
        </p>
      ) : null}
    </div>
  );
}
