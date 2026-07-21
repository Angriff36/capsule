import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateIngredientDemand,
  useCreatePrepTask,
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishRemove,
  useIngredientDemandConfirm,
  useIngredientDemandRecalculate,
  useIngredientDemandSupersede,
  useListDish,
  useListDishRecipe,
  useListDishTask,
  useListEvent,
  useListEventDish,
  useListIngredient,
  useListIngredientDemand,
  useListPrepTask,
  useListRecipe,
  useListRecipeIngredient,
  usePrepTaskRefreshGenerated,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { TableSkeleton } from "../../ui/primitives";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { EventMenuRecipeDemandSync } from "./EventMenuRecipeDemandSync";
import { EventPrepCoordinator } from "./EventPrepCoordinator";
import { KitchenBookNav } from "./KitchenBookNav";

export function EventMenuPage() {
  const events = useListEvent();
  const dishes = useListDish();
  const eventDishes = useListEventDish();
  const dishTasks = useListDishTask();
  const dishRecipes = useListDishRecipe();
  const recipes = useListRecipe();
  const recipeIngredients = useListRecipeIngredient();
  const prepTasks = useListPrepTask();
  const ingredients = useListIngredient();
  const demands = useListIngredientDemand();
  const createEventDish = useCreateEventDish();
  const createPrepTask = useCreatePrepTask();
  const createDemand = useCreateIngredientDemand();
  const confirmDemand = useIngredientDemandConfirm();
  const recalculateDemand = useIngredientDemandRecalculate();
  const supersedeDemand = useIngredientDemandSupersede();
  const refreshGeneratedTask = usePrepTaskRefreshGenerated();
  const adjustServings = useEventDishAdjustServings();
  const removeDish = useEventDishRemove();
  const [eventId, setEventId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const selectedEvent = events?.find((event) => event._id === eventId);
  const selections = (eventDishes ?? []).filter(
    (item) => item.deletedAt == null && item.eventId === eventId,
  );
  const dishName = (dishId: string) =>
    dishes?.find((dish) => dish._id === dishId)?.name ?? "Unknown dish";
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
  const coordinator = () => {
    if (
      dishTasks === undefined ||
      prepTasks === undefined ||
      ingredients === undefined ||
      demands === undefined ||
      dishRecipes === undefined ||
      recipes === undefined ||
      recipeIngredients === undefined
    ) {
      throw new Error("Prep templates and demand data are still loading");
    }
    return new EventPrepCoordinator({
      createDemand: (input) => createDemand(input),
      confirmDemand: (input) => confirmDemand(input),
      recalculateDemand: (input) => recalculateDemand(input),
      supersedeDemand: (input) => supersedeDemand(input),
      createTask: (input) => createPrepTask(input),
      refreshGeneratedTask: (input) => refreshGeneratedTask(input),
    });
  };
  const syncRecipeDemands = async (override?: {
    id: string;
    eventId: string;
    dishId: string;
    quantityServings: number;
    specialInstructions?: string | null;
  }) => {
    const prep = coordinator();
    const sync = new EventMenuRecipeDemandSync(prep, {
      dishRecipes: dishRecipes ?? [],
      recipes: recipes ?? [],
      recipeIngredients: recipeIngredients ?? [],
      demands: demands ?? [],
    });
    await sync.forEventDishes({
      eventId,
      eventDishes: EventMenuRecipeDemandSync.activeEventDishes(
        eventId,
        eventDishes ?? [],
        override,
      ),
    });
  };
  const syncPrepForDish = async (eventDish: {
    id: string;
    eventId: string;
    dishId: string;
    quantityServings: number;
    specialInstructions?: string | null;
  }) => {
    const prep = coordinator();
    await prep.sync({
      eventDish,
      templates: (dishTasks ?? []).map((task) => ({
        id: task._id,
        dishId: task.dishId,
        name: task.name,
        defaultQuantity: task.defaultQuantity,
        defaultUnit: (task.defaultUnit ??
          ingredients?.find(
            (ingredient) => ingredient._id === task.ingredientId,
          )?.unit ??
          "portion") as never,
        category: task.category,
        taskType: task.taskType,
        sortOrder: task.sortOrder,
        recipeId: task.recipeId,
        ingredientId: task.ingredientId,
        instructions: task.instructions,
        status: task.status,
      })),
      tasks: (prepTasks ?? []).map((task) => ({
        id: task._id,
        eventDishId: task.eventDishId,
        eventId: task.eventId,
        dishId: task.dishId,
        dishTaskId: task.dishTaskId,
        name: task.name,
        quantity: Number(task.quantity),
        unit: task.unit as never,
        ingredientId: task.ingredientId,
        ingredientDemandId: task.ingredientDemandId,
        recipeId: task.recipeId,
        specialInstructions: task.specialInstructions,
        isGenerated: task.isGenerated,
        status: task.status,
        version: task.version,
        deletedAt: task.deletedAt,
      })),
      demands: (demands ?? []).map((demand) => ({
        id: demand._id,
        eventId: demand.eventId,
        ingredientId: demand.ingredientId,
        requiredQuantity: Number(demand.requiredQuantity),
        unit: demand.unit as never,
        status: demand.status,
        version: demand.version,
      })),
      skipDemand: true,
    });
    await syncRecipeDemands(eventDish);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("addToEvent", async () => {
      const quantityServings = Number(data.get("quantityServings"));
      const specialInstructions =
        String(data.get("specialInstructions") ?? "").trim() || undefined;
      const created = (await createEventDish({
        eventId,
        dishId: String(data.get("dishId")),
        quantityServings,
        course: String(data.get("course") ?? "").trim() || undefined,
        serviceStyle:
          String(data.get("serviceStyle") ?? "").trim() || undefined,
        specialInstructions,
      })) as { docId: string };
      await syncPrepForDish({
        id: created.docId,
        eventId,
        dishId: String(data.get("dishId")),
        quantityServings,
        specialInstructions,
      });
      form.reset();
    });
  };

  return (
    <div className="recipe-book-stage">
      <header className="recipe-book-masthead">
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
                    {event.title} · {event.stage}
                  </option>
                ))}
            </select>
          </label>
          {selectedEvent ? (
            <dl className="event-menu-brief">
              <div>
                <dt>Stage</dt>
                <dd>{selectedEvent.stage}</dd>
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
          <form onSubmit={submit} className="culinary-create-form mt-6">
            <div className="culinary-create-heading">
              <div>
                <p className="eyebrow">Dish selection</p>
                <h2 className="font-display text-2xl">Add to event</h2>
              </div>
              <button
                className="btn btn-primary"
                disabled={!eventId || busy != null}
              >
                {busy === "select" ? "Selecting…" : "Select dish"}
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
                            await syncPrepForDish({
                              id: selection._id,
                              eventId: selection.eventId,
                              dishId: selection.dishId,
                              quantityServings: quantity,
                              specialInstructions:
                                selection.specialInstructions,
                            });
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
                            await syncRecipeDemands({
                              id: selection._id,
                              eventId: selection.eventId,
                              dishId: selection.dishId,
                              quantityServings: 0,
                            });
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
