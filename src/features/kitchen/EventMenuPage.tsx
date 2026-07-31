import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  useCreateInventoryReservation,
  useCreatePrepTask,
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishRemove,
  useInventoryReservationRelease,
  useListDish,
  useListDishComponent,
  useListDishTask,
  useListEvent,
  useListEventDish,
  useListIngredient,
  useListIngredientDemand,
  useListInventoryItem,
  useListInventoryLot,
  useListInventoryReservation,
  useListMenu,
  useListMenuDish,
  useListPrepTask,
  useListComponent,
  useListComponentIngredient,
  usePrepTaskRefreshGenerated,
} from "../../lib/manifest-convex-react";
import type { EventStockShortage } from "../events/EventStockReservationCoordinator";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { formatStatusLabel } from "../../lib/statusLabels";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { EventMenuStockShortageBanner } from "./EventMenuStockShortageBanner";
import { EventMenuSyncController } from "./EventMenuSyncController";
import { KitchenBookNav } from "./KitchenBookNav";

export function EventMenuPage() {
  const events = useListEvent();
  const dishes = useListDish();
  const eventDishes = useListEventDish();
  const dishTasks = useListDishTask();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const prepTasks = useListPrepTask();
  const ingredients = useListIngredient();
  const demands = useListIngredientDemand();
  const inventoryItems = useListInventoryItem();
  const inventoryLots = useListInventoryLot();
  const inventoryReservations = useListInventoryReservation();
  const menus = useListMenu();
  const menuDishes = useListMenuDish();
  const createEventDish = useCreateEventDish();
  const createPrepTask = useCreatePrepTask();
  const createReservation = useCreateInventoryReservation();
  const releaseReservation = useInventoryReservationRelease();
  const refreshGeneratedTask = usePrepTaskRefreshGenerated();
  const adjustServings = useEventDishAdjustServings();
  const removeDish = useEventDishRemove();
  const [searchParams] = useSearchParams();
  const [eventId, setEventId] = useState(searchParams.get("eventId") ?? "");
  const [templateMenuId, setTemplateMenuId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [stockShortages, setStockShortages] = useState<EventStockShortage[]>(
    [],
  );
  const { prompt, host } = useActionPrompt(busy != null);

  const selectedEvent = events?.find((event) => event._id === eventId);
  const selections = (eventDishes ?? []).filter(
    (item) => item.deletedAt == null && item.eventId === eventId,
  );
  const dishName = (dishId: string) =>
    dishes?.find((dish) => dish._id === dishId)?.name ?? "Unknown dish";
  const templateMenus = (menus ?? []).filter(
    (menu) =>
      menu.deletedAt == null && menu.isTemplate && menu.status !== "archived",
  );
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
  const menuSync = () =>
    new EventMenuSyncController(
      {
        createTask: ((input: never) => createPrepTask(input)) as never,
        refreshGeneratedTask: ((input: never) =>
          refreshGeneratedTask(input)) as never,
        createReservation: async (input) => {
          const doc = (await createReservation(input)) as { docId: string };
          return { docId: doc.docId };
        },
        releaseReservation: (input) => releaseReservation(input),
      },
      EventMenuSyncController.requireCatalogs({
        dishTasks: dishTasks as never,
        prepTasks: prepTasks as never,
        ingredients: ingredients as never,
        demands: demands as never,
        dishComponents: dishComponents as never,
        components: components as never,
        componentIngredients: componentIngredients as never,
        eventDishes: eventDishes as never,
        inventoryItems: inventoryItems as never,
        inventoryLots: inventoryLots as never,
        inventoryReservations: inventoryReservations as never,
      }),
    );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("addToEvent", async () => {
      const quantityServings = Number(data.get("quantityServings"));
      const specialInstructions =
        String(data.get("specialInstructions") ?? "").trim() || undefined;
      await createEventDish({
        eventId,
        dishId: String(data.get("dishId")),
        quantityServings,
        course: String(data.get("course") ?? "").trim() || undefined,
        serviceStyle:
          String(data.get("serviceStyle") ?? "").trim() || undefined,
        specialInstructions,
      });
      // Prep tasks come from the EventDishAdded reaction; syncing them here
      // would duplicate, because these catalogs predate the server's rows.
      const shortages = await menuSync().syncComponentDemands(eventId);
      setStockShortages(shortages);
      form.reset();
    });
  };

  const applyTemplate = () => {
    if (!templateMenuId || !selectedEvent) return;
    const existing = new Set(selections.map((item) => item.dishId));
    const activeDishIds = new Set(
      (dishes ?? [])
        .filter((dish) => dish.deletedAt == null && dish.status === "active")
        .map((dish) => dish._id),
    );
    const lines = (menuDishes ?? []).filter(
      (line) =>
        line.deletedAt == null &&
        line.menuId === templateMenuId &&
        !existing.has(line.dishId) &&
        activeDishIds.has(line.dishId),
    );
    const servings = Number(selectedEvent.expectedHeadcount) || 1;
    void run("applyTemplate", async () => {
      const allShortages: EventStockShortage[] = [];
      for (const line of lines) {
        await createEventDish({
          eventId,
          dishId: line.dishId,
          quantityServings: servings,
          course: line.course ?? undefined,
          serviceStyle: line.serviceStyle ?? undefined,
          specialInstructions: line.specialInstructions ?? undefined,
        });
      }
      allShortages.push(...(await menuSync().syncComponentDemands(eventId)));
      setStockShortages(allShortages);
      setTemplateMenuId("");
    });
  };

  return (
    <div className="component-book-stage">
      <header className="component-book-masthead">
        <div>
          <p className="eyebrow">Culinary book · Cross-system handoff</p>
          <h1 className="display-title mt-2">Event menu</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Add dishes to a real event. Managers can add, adjust, zero servings
            (86), or remove through planning and executing.
          </p>
        </div>
      </header>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
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
      {host}
      <div className="event-menu-layout">
        <section>
          <div className="culinary-section-heading">
            <h2>Engagement</h2>
          </div>
          <label className="field-label mt-5">
            Event
            <select
              id="event-menu-event"
              className="input"
              value={eventId}
              onChange={(event) => setEventId(event.target.value)}
            >
              <option value="">Select event</option>
              {(events ?? [])
                .filter((event) => event.deletedAt == null)
                .map((event) => (
                  <option key={event._id} value={event._id}>
                    {event.title} · {formatStatusLabel(String(event.stage))}
                  </option>
                ))}
            </select>
          </label>
          {selectedEvent ? (
            <dl className="event-menu-brief">
              <div>
                <dt>Stage</dt>
                <dd>
                  <StatusChip status={String(selectedEvent.stage)} />
                </dd>
              </div>
              <div>
                <dt>Headcount</dt>
                <dd>{selectedEvent.expectedHeadcount}</dd>
              </div>
              <div>
                <dt>Venue</dt>
                <dd>{selectedEvent.venueName || "—"}</dd>
              </div>
            </dl>
          ) : null}
          {eventId && templateMenus.length ? (
            <div className="culinary-create-form mt-6">
              <div className="culinary-create-heading">
                <div>
                  <p className="eyebrow">Menu template</p>
                  <h2 className="font-display text-xl">
                    Start from a template
                  </h2>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    !templateMenuId || busy != null || menuDishes === undefined
                  }
                  onClick={applyTemplate}
                >
                  {busy === "applyTemplate" ? "Applying…" : "Apply template"}
                </button>
              </div>
              <label className="field-label">
                Template
                <select
                  className="input"
                  value={templateMenuId}
                  onChange={(event) => setTemplateMenuId(event.target.value)}
                >
                  <option value="">Select template</option>
                  {templateMenus.map((menu) => (
                    <option key={menu._id} value={menu._id}>
                      {menu.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <form onSubmit={submit} className="culinary-create-form mt-6">
            <div className="culinary-create-heading">
              <div>
                <p className="eyebrow">Dish selection</p>
                <h2 className="font-display text-xl">Add to event</h2>
              </div>
              <button
                className="btn btn-primary"
                disabled={!eventId || busy != null}
              >
                {busy === "addToEvent" ? "Adding…" : "Select dish"}
              </button>
            </div>
            <div className="culinary-create-grid">
              <label className="field-label sm:col-span-2">
                Dish
                <select
                  id="event-menu-dish"
                  name="dishId"
                  className="input"
                  required
                >
                  <option value="">Select dish</option>
                  {(dishes ?? [])
                    .filter(
                      (dish) =>
                        dish.deletedAt == null && dish.status === "active",
                    )
                    .map((dish) => (
                      <option key={dish._id} value={dish._id}>
                        {dish.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Servings
                <input
                  name="quantityServings"
                  type="number"
                  min={1}
                  defaultValue={selectedEvent?.expectedHeadcount || 1}
                  className="input"
                  required
                />
              </label>
              <label className="field-label">
                Course
                <input name="course" className="input" />
              </label>
              <label className="field-label">
                Service style
                <input name="serviceStyle" className="input" />
              </label>
              <label className="field-label sm:col-span-2">
                Special instructions
                <textarea
                  name="specialInstructions"
                  className="input min-h-20 py-2"
                />
              </label>
            </div>
          </form>
        </section>
        <section>
          <div className="culinary-section-heading">
            <h2>Selected dishes</h2>
            <span>{selections.length}</span>
          </div>
          {eventDishes === undefined ? (
            <div className="card mt-5">
              <TableSkeleton rows={5} />
            </div>
          ) : !eventId ? (
            <div className="document-empty">
              <p>Choose an event.</p>
              <span>Its selected dishes will appear here.</span>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    document.getElementById("event-menu-event")?.focus()
                  }
                >
                  Select event
                </button>
                <Link to="/events" className="btn btn-ghost btn-sm">
                  Open events
                </Link>
              </div>
            </div>
          ) : selections.length === 0 ? (
            <div className="document-empty">
              <p>No dishes selected.</p>
              <span>
                Add the first service dish through the generated selection
                command.
              </span>
              <div className="mt-3 flex justify-center">
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() =>
                    document.getElementById("event-menu-dish")?.focus()
                  }
                >
                  Choose a dish
                </button>
              </div>
            </div>
          ) : (
            <ul className="event-dish-list">
              {selections.map((selection) => (
                <li key={selection._id}>
                  <div>
                    <strong>{dishName(selection.dishId)}</strong>
                    <span>
                      {selection.course || "Unassigned course"} ·{" "}
                      {selection.serviceStyle || "No service style"}
                    </span>
                  </div>
                  <p>{selection.quantityServings} servings</p>
                  <div className="flex gap-1">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => {
                        void (async () => {
                          const values = await prompt.askFields({
                            title: "Adjust servings",
                            description:
                              "Enter the new serving count for this event dish.",
                            fields: [
                              {
                                name: "quantityServings",
                                label: "Servings",
                                defaultValue: String(
                                  selection.quantityServings,
                                ),
                                inputType: "number",
                                required: true,
                              },
                            ],
                            confirmLabel: "Save servings",
                          });
                          if (!values) return;
                          const quantity = Number(values.quantityServings);
                          if (!Number.isFinite(quantity) || quantity <= 0)
                            return;
                          void run(`adjust:${selection._id}`, async () => {
                            await adjustServings({
                              docId: selection._id,
                              quantityServings: quantity,
                              version: selection.version,
                            });
                            const shortages = await menuSync().syncPrepForDish({
                              id: selection._id,
                              eventId: selection.eventId,
                              dishId: selection.dishId,
                              quantityServings: quantity,
                              specialInstructions:
                                selection.specialInstructions,
                            });
                            setStockShortages(shortages);
                          });
                        })();
                      }}
                    >
                      Adjust
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
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
                          void run(`remove:${selection._id}`, async () => {
                            await removeDish({
                              docId: selection._id,
                              reason,
                              version: selection.version,
                            });
                            const shortages =
                              await menuSync().syncComponentDemands(eventId, {
                                id: selection._id,
                                eventId: selection.eventId,
                                dishId: selection.dishId,
                                quantityServings: 0,
                              });
                            setStockShortages(shortages);
                          });
                        })();
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
