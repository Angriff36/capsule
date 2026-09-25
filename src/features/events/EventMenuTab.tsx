import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishChangeCourse,
  useEventDishRemove,
  useEventDishReorder,
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
  useListEventGuest,
  useListIngredient,
  useListIngredientPriceObservation,
  useListItemUnitMapping,
  useListInventoryItem,
  useListInventoryReservation,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import { useHeldQueryRows } from "../../lib/heldQueryRows";
import { RecordedUnitMappings } from "../../lib/recordedUnitMappings";
import type { Id } from "../../lib/api";
import {
  CateringPackagePicker,
  type CateringPackageInput,
} from "./CateringPackagePicker";
import {
  useMaterializeEventMenuTemplate,
  useApplyCateringPackage,
} from "../../lib/operational-transactions";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";
import { AllergenIconRow } from "../kitchen/AllergenIconRow";
import { ComponentNutritionPanel } from "../kitchen/ComponentNutritionPanel";
import { CulinaryRecordPicker } from "../kitchen/CulinaryRecordPicker";
import { EventMenuStockShortageBanner } from "../kitchen/EventMenuStockShortageBanner";
import { DishPrimaryImage } from "../attachments/DishPrimaryImage";
import { dishPath } from "../kitchen/kitchenRoutes";
import { useEventMenuSync } from "../kitchen/useEventMenuSync";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { ActionMenu, ActionMenuRule, Skeleton } from "../../ui/primitives";
import { PlusIcon } from "../../ui/icons";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import type { EventStockShortage } from "./EventStockReservationCoordinator";
import { TemplateStockSyncLifecycle } from "./TemplateStockSyncLifecycle";
import { reconcileRecoveredMenuRequest } from "./reconcileRecoveredMenuRequest";
import { FailureBanner } from "./FailureBanner";
import { ComponentStockSuggestions } from "./ComponentStockSuggestions";
import { EventDraftPoButton } from "./EventDraftPoButton";
import { EventMenuLineNote } from "./EventMenuLineNote";
import { EventMenuLineOverrides } from "./EventMenuLineOverrides";
import { orderEventMenuLines, planEventMenuLineSwap } from "./eventMenuOrder";
import { eventDishLabel } from "./eventDishLabel";
import {
  EventMenuDietaryConflictsCard,
  type DietaryConflictInputs,
} from "./EventMenuDietaryConflictsCard";
import { EventMenuRecipeEditor } from "./EventMenuRecipeEditor";
import { eventMenuHeadcountHint } from "../../lib/eventMenuHeadcountHint";
import { ReviewFlagButton } from "./review-flags/ReviewFlagButton";
import { useEventReviewFlags } from "./review-flags/useEventReviewFlags";
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
  expectedHeadcount?: number | null;
};

/** One ledger row: identity, the four editable fields, cost, actions. */
const MENU_ROW_COLUMNS =
  "xl:grid-cols-[minmax(0,1fr)_8rem_5.5rem_7rem_4.5rem_7.5rem_auto]";

export function EventMenuTab({ eventId, expectedHeadcount }: Props) {
  const event = useGetEvent(eventId);
  const dishes = useHeldQueryRows("dishes", useListDish());
  const eventDishes = useHeldQueryRows("eventDishes", useListEventDish());
  const eventGuests = useListEventGuest();
  const reviewFlags = useEventReviewFlags(eventId);
  const dishIngredients = useListDishIngredient();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  const itemUnitMappings = useListItemUnitMapping();
  const priceObservations = useListIngredientPriceObservation();
  const containers = useListDishContainer();
  const inventoryItems = useListInventoryItem();
  const inventoryReservations = useListInventoryReservation();
  const materializeTemplate = useMaterializeEventMenuTemplate();
  const applyPackage = useApplyCateringPackage();
  const createEventDish = useCreateEventDish();
  const adjustServings = useEventDishAdjustServings();
  const changeCourse = useEventDishChangeCourse();
  const removeDish = useEventDishRemove();
  const reorderDish = useEventDishReorder();
  const setHeadcountOverride = useEventDishSetHeadcountOverride();
  const updateInstructions = useEventDishUpdateInstructions();
  const {
    ready: prepSyncReady,
    syncStockForEvent,
    demandVersionsForEvent,
  } = useEventMenuSync();
  const [showPicker, setShowPicker] = useState(false);
  const [stockShortages, setStockShortages] = useState<EventStockShortage[]>(
    [],
  );
  const [openRecipeId, setOpenRecipeId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const stockLifecycle = useRef(new TemplateStockSyncLifecycle());
  const [stockPhase, setStockPhase] = useState(0);
  const [menuSyncStatus, setMenuSyncStatus] = useState<{
    phase: "waiting" | "syncing" | "failed";
    savedCount: number;
    requestedCount: number;
    recovered: boolean;
  } | null>(null);
  const [remainingTemplateLines, setRemainingTemplateLines] = useState<{
    template: MenuTemplate;
    lines: MenuTemplate["lines"];
    servings: number;
  } | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const selections = useMemo(
    () =>
      orderEventMenuLines(
        (eventDishes ?? [])
          .filter((item) => item.deletedAt == null && item.eventId === eventId)
          .sort((a, b) =>
            String(a.course ?? "").localeCompare(String(b.course ?? "")),
          ),
      ),
    [eventDishes, eventId],
  );
  const existingDishIds = selections.map((row) => row.dishId);

  const nutrition = useEventMenuNutrition(existingDishIds);

  const refreshStock = async () => {
    if (!prepSyncReady) return;
    setStockShortages(await syncStockForEvent(eventId));
  };

  useEffect(() => {
    const phase = stockLifecycle.current.next({
      ready: prepSyncReady,
      eventDishIds: selections.map((row) => String(row._id)),
      demandVersions: demandVersionsForEvent(eventId),
    });
    if (!phase) return;
    setMenuSyncStatus((current) => current && { ...current, phase: "syncing" });
    void run("template:stock-sync", async () => {
      try {
        await refreshStock();
        stockLifecycle.current.succeeded(phase.attemptId);
        if (stockLifecycle.current.status().phase === "complete") {
          setMenuSyncStatus(null);
        }
      } catch (cause) {
        stockLifecycle.current.failed(phase.attemptId);
        if (stockLifecycle.current.status().attemptId === phase.attemptId) {
          setMenuSyncStatus(
            (current) => current && { ...current, phase: "failed" },
          );
          const classified = classifyCommandFailure(cause);
          setFailure({
            ...classified,
            detail: `${classified.detail} ${phase.savedLines} menu line${phase.savedLines === 1 ? " was" : "s were"} saved or reconciled; stock synchronization is unfinished.`,
          });
        }
      }
    });
  }, [demandVersionsForEvent, eventId, prepSyncReady, selections, stockPhase]);

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
        unitMappings: RecordedUnitMappings.fromRows(itemUnitMappings),
      }),
    [
      componentIngredients,
      components,
      dishComponents,
      dishIngredients,
      eventId,
      expectedHeadcount,
      itemUnitMappings,
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
            name: eventDishLabel({
              dishId: row.dishId,
              dishName: row.dishName,
              liveName:
                dishes?.find((dish) => dish._id === row.dishId)?.name ?? "",
              dishesLoading: dishes === undefined,
            }),
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
            dishName: eventDishLabel({
              dishId: selection.dishId,
              dishName: selection.dishName,
              liveName:
                dishes?.find((dish) => dish._id === selection.dishId)?.name ??
                "",
              dishesLoading: dishes === undefined,
            }),
            note,
          },
        ];
      }),
    [dishes, selections],
  );

  // Event-stated restrictions vs. what the catalog says is in each dish
  // (#368 item 14). Reuses the rows already loaded for costing.
  const dietaryConflictInputs: DietaryConflictInputs = useMemo(
    () => ({
      eventId,
      event,
      guests: eventGuests ?? [],
      selections,
      dishes,
      dishIngredients: dishIngredients ?? [],
      dishComponents: dishComponents ?? [],
      componentIngredients: componentIngredients ?? [],
      ingredients: ingredients ?? [],
      components: components ?? [],
    }),
    [
      componentIngredients,
      components,
      dishComponents,
      dishIngredients,
      dishes,
      event,
      eventGuests,
      eventId,
      ingredients,
      selections,
    ],
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

  const applyCateringPackage = async (input: CateringPackageInput) => {
    setBusy(`package:${input.packageId}`);
    try {
      const result = await applyPackage({
        ...input,
        eventId: eventId as Id<"events">,
      });
      if (result.savedDishIds.length > 0) {
        stockLifecycle.current.begin({
          savedDishIds: result.savedDishIds,
          savedDemandVersions: result.savedDemandVersions,
        });
        setMenuSyncStatus({
          phase: "waiting",
          savedCount: result.savedDishIds.length,
          requestedCount: result.savedDishIds.length,
          recovered: result.recovered,
        });
        setStockPhase((current) => current + 1);
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  const materializeTemplateLines = async (
    template: MenuTemplate,
    lines: MenuTemplate["lines"],
    servings: number,
  ) => {
    const scope = `event-menu-template:${eventId}:${template.menuId}`;
    const pending = beginPendingOperation(scope, {
      eventId: eventId as Id<"events">,
      lines: lines.map((line) => ({
        dishId: line.dishId as Id<"dishes">,
        quantityServings: servings,
        course: line.course,
        serviceStyle: line.serviceStyle,
      })),
    });
    const result = await materializeTemplate({
      ...pending.payload,
      operationKey: pending.key,
    });
    confirmPendingOperation(scope);
    const reconciliation = reconcileRecoveredMenuRequest(
      lines.map((line) => line.dishId),
      result.appliedDishIds,
    );
    const outstanding = new Set(reconciliation.outstandingDishIds);
    const remaining = lines.filter((line) => outstanding.has(line.dishId));
    setRemainingTemplateLines(
      remaining.length > 0 ? { template, lines: remaining, servings } : null,
    );
    stockLifecycle.current.begin({
      savedDishIds: result.savedDishIds,
      savedDemandVersions: result.savedDemandVersions,
    });
    setMenuSyncStatus({
      phase: "waiting",
      savedCount: result.savedCount,
      requestedCount: result.requestedCount,
      recovered: result.recovered === true,
    });
    setStockPhase((current) => current + 1);
  };

  const requestServings = async (title: string) => {
    if (expectedHeadcount != null && expectedHeadcount > 0)
      return expectedHeadcount;
    const values = await prompt.askFields({
      title,
      description: "This event has no guest count. Enter the servings to add.",
      fields: [
        {
          name: "servings",
          label: "Servings",
          defaultValue: "",
          inputType: "number",
          required: true,
        },
      ],
      confirmLabel: "Add to menu",
    });
    if (!values) return null;
    const servings = Number(values.servings);
    if (
      !values.servings.trim() ||
      !Number.isSafeInteger(servings) ||
      servings <= 0
    )
      throw new Error("Enter a positive whole-number serving count.");
    return servings;
  };

  const applyTemplate = (template: MenuTemplate) =>
    void run(`template:${template.menuId}`, async () => {
      const confirmed = await prompt.askConfirm({
        title: `Apply “${template.name}”`,
        description: `${template.lines.length} ${template.lines.length === 1 ? "dish" : "dishes"} join this menu. ${expectedHeadcount != null && expectedHeadcount > 0 ? "The event headcount supplies servings." : "Enter servings in the next step."}`,
        confirmLabel: "Apply template",
      });
      if (!confirmed) return;
      const servings = await requestServings("Template servings");
      if (servings == null) return;
      const missing = template.lines.filter(
        (line) => !existingDishIds.includes(line.dishId),
      );
      await materializeTemplateLines(template, missing, servings);
    });

  const applyRemainingTemplateLines = () => {
    const remaining = remainingTemplateLines;
    if (!remaining) return;
    void run(`template:${remaining.template.menuId}:remaining`, async () => {
      await materializeTemplateLines(
        remaining.template,
        remaining.lines,
        remaining.servings,
      );
    });
  };

  const retryTemplateStockSync = () => {
    stockLifecycle.current.retry();
    setMenuSyncStatus((current) =>
      current ? { ...current, phase: "waiting" } : current,
    );
    setStockPhase((current) => current + 1);
  };

  // One dish-specific note per menu line, for THIS event only. Works for
  // lines with no note yet (the row's "Add kitchen note" button) as well as
  // the sidebar's Edit; sell price and pans ride along untouched.
  const editNoteForLine = (lineId: string, suggestedNote?: string) => {
    void (async () => {
      const selection = selections.find((item) => item._id === lineId);
      if (!selection) return;
      const dishName = eventDishLabel({
        dishId: selection.dishId,
        dishName: selection.dishName,
        liveName:
          dishes?.find((dish) => dish._id === selection.dishId)?.name ?? "",
        dishesLoading: dishes === undefined,
      });
      const current = parseEventMenuLineFields(selection.specialInstructions);
      const startingNote =
        suggestedNote && !current.notes.includes(suggestedNote)
          ? [current.notes.trim(), suggestedNote].filter(Boolean).join("\n")
          : current.notes;
      const values = await prompt.askFields({
        title: `Kitchen note — ${dishName}`,
        description:
          "An instruction for this dish on this event only — sauce on the side, doneness, plating, allergy handling. Prints on the menu and prep sheets. The catalog dish is not changed.",
        fields: [
          {
            name: "note",
            label: "Note",
            defaultValue: startingNote,
            multiline: true,
            required: false,
            placeholder: "e.g. Peppercorn cream sauce on the side",
          },
        ],
        confirmLabel: "Save note",
      });
      if (!values) return;
      await run(`note:${lineId}`, () =>
        updateInstructions({
          docId: selection._id,
          version: selection.version,
          specialInstructions:
            encodeEventMenuLineFields({
              unitSellPrice: current.unitSellPrice,
              containerCount: current.containerCount,
              notes: values.note ?? "",
            }) || undefined,
        }),
      );
    })();
  };
  const editLineNote = (row: EventMenuNoteRow) => editNoteForLine(row.lineId);

  // Print order. Two neighbours trade places: each one is saved with the
  // position the other had on screen.
  const moveLine = (index: number, direction: -1 | 1) => {
    const swap = planEventMenuLineSwap(selections.length, index, direction);
    if (!swap) return;
    const moved = selections[swap.from];
    const displaced = selections[swap.to];
    void run(`reorder:${moved._id}`, async () => {
      await reorderDish({
        docId: moved._id,
        version: moved.version,
        sortOrder: swap.to,
      });
      await reorderDish({
        docId: displaced._id,
        version: displaced.version,
        sortOrder: swap.from,
      });
    });
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

      <CateringPackagePicker
        eventId={eventId}
        headcount={expectedHeadcount}
        startsAt={event?.startsAt ?? undefined}
        busy={busy != null}
        onApply={applyCateringPackage}
      />

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
      {menuSyncStatus ? (
        <div
          className="attention-band px-4 py-3"
          role="status"
          aria-live="polite"
        >
          <p className="font-semibold text-ink">
            {menuSyncStatus.savedCount} of {menuSyncStatus.requestedCount}{" "}
            template lines saved or reconciled
            {menuSyncStatus.recovered
              ? " (recovered from the prior attempt)"
              : ""}
            .
          </p>
          <p className="mt-1 text-base text-ink-2">
            {menuSyncStatus.phase === "failed"
              ? "Menu lines are safe. Stock synchronization is still unfinished."
              : menuSyncStatus.phase === "syncing"
                ? "Synchronizing stock for the saved menu lines…"
                : "Waiting for the saved menu rows to arrive. Ingredient demand was reconciled in the completed server operation."}
          </p>
          {remainingTemplateLines ? (
            <div className="mt-2">
              <p className="text-base font-semibold text-ink">
                {remainingTemplateLines.lines.length} newly requested template
                line
                {remainingTemplateLines.lines.length === 1
                  ? " remains"
                  : "s remain"}{" "}
                unapplied.
              </p>
              <button
                type="button"
                className="btn btn-ghost btn-sm mt-2"
                disabled={busy != null}
                onClick={applyRemainingTemplateLines}
              >
                Apply remaining {remainingTemplateLines.lines.length}
              </button>
            </div>
          ) : null}
          {menuSyncStatus.phase === "failed" ? (
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-2"
              disabled={busy != null}
              onClick={retryTemplateStockSync}
            >
              Retry stock sync only
            </button>
          ) : null}
        </div>
      ) : null}
      {!menuSyncStatus && remainingTemplateLines ? (
        <div className="attention-band px-4 py-3" role="status">
          <p className="font-semibold text-ink">
            Prior template work is complete.{" "}
            {remainingTemplateLines.lines.length} newly requested line
            {remainingTemplateLines.lines.length === 1
              ? " remains"
              : "s remain"}{" "}
            unapplied.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm mt-2"
            disabled={busy != null}
            onClick={applyRemainingTemplateLines}
          >
            Apply remaining {remainingTemplateLines.lines.length}
          </button>
        </div>
      ) : null}
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
              const servings = await requestServings("Dish servings");
              if (servings == null) return;
              await createEventDish({
                eventId,
                dishId,
                quantityServings: servings,
                dishName: dishes?.find((d) => d._id === dishId)?.name,
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
              costPerServing={
                expectedHeadcount == null ? null : costRollup.costPerServing
              }
              foodSellTotal={sellRollup.foodSellTotal}
              dishCount={selections.length}
              unpricedCount={unpricedCount}
              unpricedNote={headerUnpricedNote}
              servings={expectedHeadcount ?? null}
            />
          ) : null}

          {eventDishes === undefined || dishes === undefined ? (
            // Menu rows still arriving (first load, or returning via Back):
            // never claim "no dishes" until the list has actually answered.
            <div
              className="card space-y-3 px-5 py-6"
              role="status"
              aria-label="Loading event menu"
              data-testid="event-menu-loading"
            >
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </div>
          ) : selections.length === 0 ? (
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
                {selections.map((selection, lineIndex) => {
                  const dish = dishes?.find(
                    (row) => row._id === selection.dishId,
                  );
                  // Printed name: the line's add-time snapshot first, live
                  // catalog name only for legacy lines with no snapshot.
                  const dishTitle = eventDishLabel({
                    dishId: selection.dishId,
                    dishName: selection.dishName,
                    liveName: dish?.name ?? "",
                    dishesLoading: dishes === undefined,
                  });
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
                  const headcountHint = eventMenuHeadcountHint({
                    dishName: dishTitle,
                    quantityServings: Number(selection.quantityServings),
                    expectedHeadcount,
                    headcountOverride: (
                      selection as { headcountOverride?: number | null }
                    ).headcountOverride,
                  });
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
                              <span
                                className="text-base font-semibold text-ink"
                                data-testid="event-menu-dish-name"
                              >
                                {dishTitle}
                              </span>
                              {dish ? (
                                <Link
                                  to={dishPath(dish._id)}
                                  className="text-xs text-ink-3 underline decoration-dotted hover:text-ink"
                                  title="Opens the shared dish. Edits there change this dish on every event — use the kitchen note below for this event only."
                                  data-testid="event-menu-catalog-link"
                                >
                                  Catalog dish ↗
                                </Link>
                              ) : null}
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
                            <EventMenuLineNote
                              specialInstructions={
                                selection.specialInstructions
                              }
                              busy={busy != null}
                              onEdit={() => editNoteForLine(selection._id)}
                            />
                            <EventMenuLineOverrides
                              eventId={eventId}
                              eventDishId={selection._id}
                              dishId={selection.dishId}
                              dishName={dishTitle}
                              busy={busy != null}
                              prompt={prompt}
                              onFailure={(error) =>
                                setFailure(classifyCommandFailure(error))
                              }
                            />
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
                            {headcountHint ? (
                              <p
                                className="mt-1 text-sm font-medium text-warn"
                                data-testid="menu-headcount-hint"
                                title="Set a food-cost headcount on this line if the count is deliberate."
                              >
                                {headcountHint.text}
                              </p>
                            ) : null}
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
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={busy != null || lineIndex === 0}
                            aria-label={`Move ${dish?.name ?? "this dish"} earlier on the printed menu`}
                            title="Move earlier on the printed menu"
                            onClick={() => moveLine(lineIndex, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={
                              busy != null ||
                              lineIndex === selections.length - 1
                            }
                            aria-label={`Move ${dish?.name ?? "this dish"} later on the printed menu`}
                            title="Move later on the printed menu"
                            onClick={() => moveLine(lineIndex, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="submit"
                            className="btn btn-secondary btn-sm"
                            disabled={busy != null}
                          >
                            Save
                          </button>
                          <ReviewFlagButton
                            flags={reviewFlags}
                            prompt={prompt}
                            targetKind="menu_line"
                            targetId={selection._id}
                            targetLabel={dish?.name ?? "Unknown dish"}
                            suggestedQuestion={headcountHint?.question}
                            busy={busy != null}
                            onError={(error) =>
                              setFailure(classifyCommandFailure(error))
                            }
                            compact
                          />
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
                                // Choosing "Remove event dish" from this
                                // menu is the confirmation; no typed reason
                                // for a routine, reversible menu edit.
                                void run(`remove:${selection._id}`, () =>
                                  removeDish({
                                    docId: selection._id,
                                    version: selection.version,
                                    reason: "Removed from event menu",
                                  }),
                                );
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
          leading={
            <EventMenuDietaryConflictsCard
              inputs={dietaryConflictInputs}
              busy={busy != null}
              onNoteLine={editNoteForLine}
            />
          }
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
