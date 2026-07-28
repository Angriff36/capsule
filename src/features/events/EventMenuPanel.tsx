import { useMemo, useState, type FormEvent } from "react";
import {
  useCreateEventDish,
  useEventDishAdjustServings,
  useEventDishRemove,
  useEventDishSetHeadcountOverride,
  useListDish,
  useListDishComponent,
  useListEventDish,
  useListIngredient,
  useListComponent,
  useListComponentIngredient,
} from "../../lib/manifest-convex-react";
import { formatMoneyExact } from "../../lib/format";
import {
  calculateComponentNutrition,
  sumPerGuestNutrition,
  toNutritionIngredient,
  type ComponentNutritionLineInput,
} from "../kitchen/ComponentNutrition";
import { ComponentNutritionPanel } from "../kitchen/ComponentNutritionPanel";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { classifyCommandFailure, type CommandFailure } from "./CommandFailure";
import { FailureBanner } from "./FailureBanner";

type Props = {
  eventId: string;
  expectedHeadcount: number;
};

// ponytail: add-only checkpoint — reuses EventDish.addToEvent/adjust/remove.
// The kitchen Event menu page still owns prep-task sync + stock reservation;
// wire those here too if dishes added on this screen should also generate prep.
export function EventMenuPanel({ eventId, expectedHeadcount }: Props) {
  const dishes = useListDish();
  const eventDishes = useListEventDish();
  const dishComponents = useListDishComponent();
  const components = useListComponent();
  const componentIngredients = useListComponentIngredient();
  const ingredients = useListIngredient();
  const createEventDish = useCreateEventDish();
  const adjustServings = useEventDishAdjustServings();
  const setHeadcountOverride = useEventDishSetHeadcountOverride();
  const removeDish = useEventDishRemove();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const selections = (eventDishes ?? []).filter(
    (item) => item.deletedAt == null && item.eventId === eventId,
  );

  // Per-guest nutrition across the event's dishes → components. Operational
  // estimate; it does not re-scale for dish-level component yields.
  const eventNutrition = useMemo(() => {
    const dishIds = new Set(
      (eventDishes ?? [])
        .filter((item) => item.deletedAt == null && item.eventId === eventId)
        .map((item) => String(item.dishId)),
    );
    const nutritionIngredients = (ingredients ?? [])
      .filter((ingredient) => ingredient.deletedAt == null)
      .map(toNutritionIngredient);
    const linesByComponent = new Map<string, ComponentNutritionLineInput[]>();
    for (const line of componentIngredients ?? []) {
      if (line.deletedAt != null) continue;
      const list = linesByComponent.get(line.componentId) ?? [];
      list.push({
        id: line._id,
        ingredientId: line.ingredientId,
        quantity: Number(line.quantity),
        unit: line.unit,
      });
      linesByComponent.set(line.componentId, list);
    }
    const componentById = new Map(
      (components ?? []).map((component) => [component._id, component]),
    );
    const summaries = (dishComponents ?? [])
      .filter(
        (attachment) =>
          attachment.deletedAt == null &&
          dishIds.has(String(attachment.dishId)),
      )
      .map((attachment) => {
        const component = componentById.get(attachment.componentId);
        return calculateComponentNutrition({
          lines: linesByComponent.get(attachment.componentId) ?? [],
          ingredients: nutritionIngredients,
          servesPerYield: Number(
            (component as { servesPerYield?: number } | undefined)
              ?.servesPerYield ?? 1,
          ),
        });
      });
    return sumPerGuestNutrition(summaries);
  }, [
    eventDishes,
    eventId,
    dishComponents,
    components,
    componentIngredients,
    ingredients,
  ]);
  const nutritionLoading =
    dishComponents === undefined ||
    components === undefined ||
    componentIngredients === undefined ||
    ingredients === undefined;
  const eventNutritionNote =
    eventNutrition.componentCount === 0
      ? "Add dishes with components to estimate per-guest nutrition."
      : `Estimated across ${eventNutrition.componentCount} component${eventNutrition.componentCount === 1 ? "" : "s"} on this event${eventNutrition.isComplete ? "" : ` (${eventNutrition.measuredComponentCount} with recorded nutrition)`}.`;
  const dishName = (dishId: string) =>
    dishes?.find((dish) => dish._id === dishId)?.name ?? "Unknown dish";
  const foodCostTotal = selections.reduce((total, item) => {
    const cost = Number(
      (item as { estimatedCost?: number }).estimatedCost ?? 0,
    );
    return total + (Number.isFinite(cost) ? cost : 0);
  }, 0);

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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const dishId = String(data.get("dishId"));
    if (!dishId) return;
    const rawServings = Number(data.get("quantityServings"));
    const quantityServings =
      Number.isFinite(rawServings) && rawServings >= 0
        ? rawServings
        : Math.max(1, expectedHeadcount || 1);
    const rawOverride = Number(data.get("headcountOverride"));
    const headcountOverride =
      Number.isFinite(rawOverride) && rawOverride > 0 ? rawOverride : 0;
    void run("add", async () => {
      await createEventDish({
        eventId,
        dishId,
        quantityServings,
        headcountOverride,
        course: String(data.get("course") ?? "").trim() || undefined,
        serviceStyle:
          String(data.get("serviceStyle") ?? "").trim() || undefined,
        specialInstructions:
          String(data.get("specialInstructions") ?? "").trim() || undefined,
      });
      form.reset();
    });
  };

  return (
    <section className="card space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Menu</h2>
        <span className="text-[12px] text-ink-3">
          {selections.length} dishes
          {foodCostTotal > 0
            ? ` · est. food ${formatMoneyExact(foodCostTotal)}`
            : ""}
        </span>
      </div>
      {failure ? <FailureBanner failure={failure} /> : null}
      {host}
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="field-label sm:col-span-2">
          Dish
          <select name="dishId" className="input" required>
            <option value="">Select dish</option>
            {(dishes ?? [])
              .filter(
                (dish) => dish.deletedAt == null && dish.status === "active",
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
            min={0}
            defaultValue={expectedHeadcount || 1}
            className="input"
            required
          />
        </label>
        <label className="field-label">
          Headcount override
          <input
            name="headcountOverride"
            type="number"
            min={0}
            defaultValue={0}
            className="input"
            title="Leave 0 to use the event guest count for food-cost batches"
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
            className="input min-h-16 py-2"
          />
        </label>
        <div className="sm:col-span-2">
          <button className="btn btn-primary" disabled={busy != null}>
            {busy === "add" ? "Adding…" : "Add dish"}
          </button>
        </div>
      </form>
      {eventDishes === undefined ? null : selections.length === 0 ? (
        <div className="document-empty">
          <p>No dishes on this event yet.</p>
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
              <p>
                {selection.quantityServings} servings
                {Number(
                  (selection as { requiredBatches?: number }).requiredBatches,
                ) > 0
                  ? ` · ${Number((selection as { requiredBatches?: number }).requiredBatches)} batches`
                  : ""}
                {Number(
                  (selection as { estimatedCost?: number }).estimatedCost,
                ) > 0
                  ? ` · est. ${formatMoneyExact(Number((selection as { estimatedCost?: number }).estimatedCost))}`
                  : ""}
              </p>
              <div className="flex gap-1">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => {
                    void (async () => {
                      const values = await prompt.askFields({
                        title: "Adjust servings",
                        description:
                          "Enter the new serving count for this dish.",
                        fields: [
                          {
                            name: "quantityServings",
                            label: "Servings",
                            defaultValue: String(selection.quantityServings),
                            inputType: "number",
                            required: true,
                          },
                        ],
                        confirmLabel: "Save servings",
                      });
                      if (!values) return;
                      const quantity = Number(values.quantityServings);
                      if (!Number.isFinite(quantity) || quantity < 0) return;
                      void run(`adjust:${selection._id}`, async () => {
                        await adjustServings({
                          docId: selection._id,
                          quantityServings: quantity,
                          version: selection.version,
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
                      const values = await prompt.askFields({
                        title: "Food-cost headcount",
                        description:
                          "Guests this dish is costed for. 0 uses the event guest count.",
                        fields: [
                          {
                            name: "headcountOverride",
                            label: "Headcount override",
                            defaultValue: String(
                              (selection as { headcountOverride?: number })
                                .headcountOverride ?? 0,
                            ),
                            inputType: "number",
                            required: true,
                          },
                        ],
                        confirmLabel: "Save headcount",
                      });
                      if (!values) return;
                      const override = Number(values.headcountOverride);
                      if (!Number.isFinite(override) || override < 0) return;
                      void run(`override:${selection._id}`, async () => {
                        await setHeadcountOverride({
                          docId: selection._id,
                          headcountOverride: override,
                          version: selection.version,
                        });
                      });
                    })();
                  }}
                >
                  Headcount
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={busy != null}
                  onClick={() => {
                    void (async () => {
                      const reason = await prompt.askReason({
                        ...ReasonCopy.removeLine,
                        title: "Remove dish",
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

      <ComponentNutritionPanel
        heading="Per-guest nutrition"
        portionLabel="per guest"
        totals={
          eventNutrition.componentCount > 0 ? eventNutrition.perGuest : null
        }
        coverageNote={eventNutritionNote}
        loading={nutritionLoading}
      />
    </section>
  );
}
