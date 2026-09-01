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
import { PlusIcon } from "../../ui/icons";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import type { EventStockShortage } from "./EventStockReservationCoordinator";
import { FailureBanner } from "./FailureBanner";
import { ComponentStockSuggestions } from "./ComponentStockSuggestions";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventMenuRecipeEditor } from "./EventMenuRecipeEditor";
import { eventMenuCourseTallies, EventMenuSidebar } from "./EventMenuSidebar";
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
  encodeEventMenuLineFields,
  parseEventMenuLineFields,
  planEventMenuLineSave,
} from "./eventMenuLineFields";
import { suspectRowsFromRecipeLines } from "./eventMenuSuspectQuantity";
import { useEventMenuNutrition } from "./useEventMenuNutrition";
import { EventMenuStatsCard } from "./EventMenuStatsCard";
import {
  eventMenuDietaryTallies,
  type MenuDietaryTally,
} from "./EventMenuDietaryCard";
import type { EventMenuNoteRow } from "./EventMenuNotesCard";
import type { MenuTemplate } from "./EventMenuTemplateCard";

type Props = {
  eventId: string;
  expectedHeadcount: number;
};

/** One ledger row: identity, the four editable fields, cost, actions. */
const MENU_ROW_COLUMNS =
  "xl:grid-cols-[minmax(0,1fr)_8rem_5.5rem_7rem_4.5rem_7.5rem_auto]";

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

  const courseTallies = useMemo(
    () => eventMenuCourseTallies(selections.map((row) => row.course)),
    [selections],
  );

  const dietaryTallies: MenuDietaryTally[] = useMemo(
    () =>
      eventMenuDietaryTallies(
        selections.map(
          (row) => dishes?.find((dish) => dish._id === row.dishId)?.dietaryTags,
        ),
      ),
    [dishes, selections],
  );

  const noteRows: EventMenuNoteRow[] = useMemo(
    () =>
      selections.flatMap((selection) => {
        const note = parseEventMenuLineFields(
          selection.specialInstructions,
        ).notes.trim();
        if (note === "") return [];
        return [
          {
            lineId: selection._id,
            dishName:
              dishes?.find((dish) => dish._id === selection.dishId)?.name ??
              "Unknown dish",
            note,
          },
        ];
      }),
    [dishes, selections],
  );

  const menuAllergenCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const selection of selections) {
      const dish = dishes?.find((row) => row._id === selection.dishId);
      for (const code of dish?.allergenSummary ?? []) codes.add(String(code));
    }
    return [...codes];
  }, [dishes, selections]);

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

  const applyTemplate = (template: MenuTemplate) =>
    void run(`template:${template.menuId}`, async () => {
      const confirmed = await prompt.askConfirm({
        title: `Apply “${template.name}”`,
        description: `${template.lines.length} ${template.lines.length === 1 ? "dish" : "dishes"} join this menu at the event headcount. Edit servings after applying.`,
        confirmLabel: "Apply template",
      });
      if (!confirmed) return;
      const servings = Math.max(1, expectedHeadcount || 1);
      for (const line of template.lines) {
        if (existingDishIds.includes(line.dishId)) continue;
        await createEventDish({
          eventId,
          dishId: line.dishId,
          quantityServings: servings,
          headcountOverride: 0,
          course: line.course,
          serviceStyle: line.serviceStyle,
        });
      }
      await refreshStock();
    });

  const editLineNote = (row: EventMenuNoteRow) => {
    void (async () => {
      const selection = selections.find((item) => item._id === row.lineId);
      if (!selection) return;
      const values = await prompt.askFields({
        title: `Menu note — ${row.dishName}`,
        description: "Shown on the menu rail. Keeps sell and pans fields.",
        fields: [
          {
            name: "note",
            label: "Note",
            defaultValue: row.note,
            inputType: "text",
          },
        ],
        confirmLabel: "Save note",
      });
      if (!values) return;
      const current = parseEventMenuLineFields(selection.specialInstructions);
      await run(`note:${row.lineId}`, () =>
        updateInstructions({
          docId: selection._id,
          version: selection.version,
          specialInstructions: encodeEventMenuLineFields({
            unitSellPrice: current.unitSellPrice,
            containerCount: current.containerCount,
            notes: values.note ?? "",
          }),
        }),
      );
    })();
  };

  return (
    <section className="space-y-4" data-testid="event-menu-tab">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-lg font-semibold text-ink">Event menu</h2>
          <p className="text-sm text-ink-2">
            Dishes guests will see — course, servings, price, and pans per line.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy != null}
          onClick={() => setShowPicker((value) => !value)}
        >
          {showPicker ? "Hide picker" : "Add dish"}
        </button>
      </div>

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

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          {selections.length > 0 ? (
            <EventMenuStatsCard
              foodCost={costRollup.foodCost}
              costPerServing={costRollup.costPerServing}
              foodSellTotal={sellRollup.foodSellTotal}
              dishCount={selections.length}
              unpricedCount={unpricedCount}
              unpricedNote={headerUnpricedNote}
              servings={costRollup.servings}
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
            <div className="card overflow-hidden">
              <div
                className={`hidden border-b border-line-2 bg-inset px-4 py-2.5 xl:grid xl:gap-3 ${MENU_ROW_COLUMNS}`}
              >
                <span className="text-sm font-semibold text-ink-2">Dish</span>
                <span className="text-sm font-semibold text-ink-2">Course</span>
                <span className="text-sm font-semibold text-ink-2">
                  Servings
                </span>
                <span className="text-sm font-semibold text-ink-2">
                  Sell / serving
                </span>
                <span className="text-sm font-semibold text-ink-2">Pans</span>
                <span className="text-right text-sm font-semibold text-ink-2">
                  Est. cost
                </span>
                <span className="sr-only">Actions</span>
              </div>
              <ul className="divide-y divide-line">
                {selections.map((selection) => {
                  const dish = dishes?.find(
                    (row) => row._id === selection.dishId,
                  );
                  const dishCost = eventMenuCostForDish(
                    costRollup,
                    selection._id,
                  );
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
                      : pans
                          .map((row) => `${row.count} ${row.name}`)
                          .join(" · ");
                  const sellLine = sellRollup.lines.find(
                    (line) => line.eventDishId === selection._id,
                  );
                  const recipeFlags = suspectRowsFromRecipeLines(
                    (dishIngredients ?? [])
                      .filter(
                        (line) =>
                          line.deletedAt == null &&
                          line.dishId === selection.dishId,
                      )
                      .map((line) => ({
                        name:
                          ingredients?.find(
                            (row) => row._id === line.ingredientId,
                          )?.name ?? "",
                        unit: String(line.unit),
                        quantity: Number(line.quantity),
                        prepNotes:
                          (line as { prepNotes?: string | null }).prepNotes ??
                          null,
                      })),
                    servings,
                  );
                  const recipeOpen = openRecipeId === selection._id;
                  return (
                    <li key={selection._id}>
                      <form
                        key={`${selection._id}:${selection.version}`}
                        className={`grid gap-3 px-4 py-3 xl:items-start xl:gap-3 ${MENU_ROW_COLUMNS}`}
                        onSubmit={(formEvent: FormEvent<HTMLFormElement>) => {
                          formEvent.preventDefault();
                          const data = new FormData(formEvent.currentTarget);
                          const plan = planEventMenuLineSave({
                            currentInstructions: selection.specialInstructions,
                            currentServings: Number(selection.quantityServings),
                            nextSellRaw: String(
                              data.get("unitSellPrice") ?? "",
                            ),
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
                          const nextCourse = String(
                            data.get("course") ?? "",
                          ).trim();
                          const prevCourse = String(
                            selection.course ?? "",
                          ).trim();
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
                        <div className="flex min-w-0 gap-3">
                          <DishPrimaryImage
                            storageId={dish?.primaryImageStorageId}
                            alt={dish?.name ?? "Dish"}
                            size="thumb"
                            className="h-11 w-11 shrink-0 rounded-sm"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <Link
                                to={dish ? dishPath(dish._id) : "#"}
                                className="text-base font-semibold text-ink hover:underline"
                              >
                                {dish?.name ?? "Unknown dish"}
                              </Link>
                              <AllergenIconRow codes={dish?.allergenSummary} />
                              <span
                                className={`rounded-sm px-2 py-0.5 text-xs font-semibold ${
                                  estimateKind === "priced"
                                    ? "bg-ok-soft text-ok"
                                    : "bg-warn-soft text-warn"
                                }`}
                              >
                                {estimateKind === "priced"
                                  ? "Priced"
                                  : estimateKind === "unit_mismatch"
                                    ? "Check units"
                                    : "Needs recipe"}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-sm text-ink-3">
                              {dish?.description || "No description yet."}
                            </p>
                            <p className="mt-1 text-sm text-ink-2 xl:hidden">
                              {selection.quantityServings} servings
                              {" · est. "}
                              <span className="text-ink">
                                {estimateKind === "priced"
                                  ? formatMoneyExact(estimated)
                                  : eventMenuUnpricedEstimateLabel(
                                      estimateKind,
                                    )}
                              </span>
                              {sellLine?.unitSellPrice != null
                                ? ` · sell ${formatMoneyExact(sellLine.sellTotal)}`
                                : ""}
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

                        <label className="field-label">
                          <span className="xl:sr-only">Course</span>
                          <input
                            className="field-input"
                            name="course"
                            defaultValue={selection.course ?? ""}
                            placeholder="Uncategorized"
                          />
                        </label>
                        <label className="field-label">
                          <span className="xl:sr-only">Servings</span>
                          <input
                            className="field-input"
                            name="quantityServings"
                            type="number"
                            min={0}
                            step={1}
                            data-testid="event-menu-servings"
                            defaultValue={selection.quantityServings}
                          />
                        </label>
                        <label className="field-label">
                          <span className="xl:sr-only">Sell / serving</span>
                          <input
                            className="field-input"
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
                          <span className="xl:sr-only">Pans</span>
                          <input
                            className="field-input"
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

                        <div className="hidden xl:block xl:pt-5 xl:text-right">
                          <p className="font-mono text-base text-ink">
                            {estimateKind === "priced"
                              ? formatMoneyExact(estimated)
                              : eventMenuUnpricedEstimateLabel(estimateKind)}
                          </p>
                          {dishCost && dishCost.costPerServing > 0 ? (
                            <p className="font-mono text-xs text-ink-3">
                              {formatMoneyExact(dishCost.costPerServing)} /
                              serving
                            </p>
                          ) : null}
                          {sellLine?.unitSellPrice != null ? (
                            <p className="font-mono text-xs text-ink-3">
                              sell {formatMoneyExact(sellLine.sellTotal)}
                            </p>
                          ) : null}
                          {panLabel ? (
                            <p className="text-xs text-ink-3">{panLabel}</p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 xl:pt-4">
                          <button
                            type="submit"
                            className="btn btn-secondary btn-sm"
                            disabled={busy != null}
                          >
                            Save
                          </button>
                          <ActionMenu>
                            <button
                              type="button"
                              onClick={() =>
                                setOpenRecipeId((current) =>
                                  current === selection._id
                                    ? null
                                    : selection._id,
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
                                      (
                                        selection as {
                                          headcountOverride?: number;
                                        }
                                      ).headcountOverride,
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
                                  const override = Number(
                                    values.headcountOverride,
                                  );
                                  if (
                                    !Number.isFinite(override) ||
                                    override < 0
                                  )
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
                        <div className="border-t border-line bg-inset/40 px-4 py-3">
                          <EventMenuRecipeEditor
                            dishId={selection.dishId}
                            servings={
                              dishCost?.servings ??
                              Number(selection.quantityServings)
                            }
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {selections.length > 0 ? (
            <button
              type="button"
              className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-line-2 px-5 py-3 text-base font-medium text-brand transition-colors hover:bg-brand-soft"
              disabled={busy != null}
              onClick={() => setShowPicker(true)}
            >
              <PlusIcon width={14} height={14} />
              Add dish from library
            </button>
          ) : null}
        </div>

        <EventMenuSidebar
          eventId={eventId}
          courses={courseTallies}
          allergenCodes={menuAllergenCodes}
          dietary={dietaryTallies}
          notes={noteRows}
          existingDishIds={existingDishIds}
          busy={busy != null}
          onApplyTemplate={applyTemplate}
          onEditNote={editLineNote}
        >
          <div className="card p-4">
            <p className="eyebrow">Purchasing</p>
            <p className="mt-2 mb-3 text-base text-ink-2">
              Turn this menu's ingredient needs into a vendor order.
            </p>
            <EventDraftPoButton
              eventId={eventId}
              eventStage={String(event?.stage ?? "planning")}
            />
          </div>
        </EventMenuSidebar>
      </div>

      <ComponentNutritionPanel
        heading="Per-guest nutrition"
        portionLabel="per guest"
        totals={
          nutrition.totals.componentCount > 0 ? nutrition.totals.perGuest : null
        }
        coverageNote={nutrition.coverageNote}
        loading={nutrition.loading}
      />

      <ComponentStockSuggestions />
    </section>
  );
}
