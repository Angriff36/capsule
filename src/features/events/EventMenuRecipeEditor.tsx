import { useState, type FormEvent } from "react";
import {
  useCreateDishContainer,
  useCreateDishIngredient,
  useDishIngredientAdjustQuantity,
  useDishIngredientRemove,
  useListDishContainer,
  useListDishIngredient,
  useListIngredient,
} from "../../lib/manifest-convex-react";
import {
  SELECTABLE_UNITS,
  UNIT_OF_MEASURE,
} from "../kitchen/import/UnitOfMeasureMapper";
import { convertComponentQuantity } from "../kitchen/ComponentCostCalculator";
import { eventMenuContainerCountsForDish } from "./eventMenuContainers";
import { suspectPrepQuantityFlag } from "./eventMenuSuspectQuantity";

type Props = {
  dishId: string;
  servings: number;
};

export function EventMenuRecipeEditor({ dishId, servings }: Props) {
  const lines = useListDishIngredient();
  const ingredients = useListIngredient();
  const containers = useListDishContainer();
  const addLine = useCreateDishIngredient();
  const adjustQuantity = useDishIngredientAdjustQuantity();
  const removeLine = useDishIngredientRemove();
  const defineContainer = useCreateDishContainer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState("each");

  const rows = (lines ?? [])
    .filter((line) => line.deletedAt == null && line.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const ingredientName = (id: string) =>
    ingredients?.find((row) => row._id === id)?.name ?? "Unknown ingredient";
  const catalogFor = (id: string) => ingredients?.find((row) => row._id === id);
  const panCounts = eventMenuContainerCountsForDish(
    dishId,
    servings,
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

  async function onAddIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const ingredientId = String(data.get("ingredientId") ?? "");
    const quantity = Number(data.get("quantity") ?? 0);
    if (!ingredientId || !(quantity > 0)) {
      setError("Pick an ingredient and a per-serving quantity.");
      return;
    }
    setBusy("add-ingredient");
    setError(null);
    try {
      await addLine({
        dishId,
        ingredientId,
        quantity,
        unit: unit as (typeof UNIT_OF_MEASURE)[number],
        sortOrder: rows.length,
      });
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add the ingredient.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function onAddContainer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("containerName") ?? "").trim();
    const servingsPerContainer = Number(data.get("servingsPerContainer") ?? 0);
    if (!name || servingsPerContainer < 1) {
      setError("Container name and servings per pan are required.");
      return;
    }
    setBusy("add-container");
    setError(null);
    try {
      await defineContainer({
        dishId,
        name,
        serviceMethod: "cooked_at_kitchen",
        servingsPerContainer,
        baseQuantity: Number(data.get("baseQuantity") ?? 0),
      });
      form.reset();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add the container.",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="mt-3 space-y-3 border-t border-line/60 pt-3"
      data-testid="event-menu-recipe-editor"
    >
      {error ? <p className="text-base text-danger">{error}</p> : null}
      <div>
        <p className="text-sm font-semibold text-ink">Recipe (per serving)</p>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-3">
            No ingredients yet. Add them here — you do not need to leave the
            event.
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {rows.map((line) => {
              const catalog = catalogFor(String(line.ingredientId));
              const mismatch =
                catalog != null &&
                convertComponentQuantity(
                  Number(line.quantity),
                  line.unit as never,
                  catalog.unit as never,
                ) == null;
              return (
                <li
                  key={line._id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const quantity = Number(data.get("quantity") ?? 0);
                      const nextUnit = String(data.get("unit") ?? line.unit);
                      if (!(quantity > 0)) {
                        setError("Recipe quantity must be greater than 0.");
                        return;
                      }
                      setBusy(`qty:${line._id}`);
                      setError(null);
                      void adjustQuantity({
                        docId: line._id,
                        version: line.version,
                        quantity,
                        unit: nextUnit as (typeof UNIT_OF_MEASURE)[number],
                      })
                        .catch((cause) => {
                          setError(
                            cause instanceof Error
                              ? cause.message
                              : "Could not save the recipe quantity.",
                          );
                        })
                        .finally(() => setBusy(null));
                    }}
                  >
                    <span className="min-w-32 font-medium">
                      {ingredientName(String(line.ingredientId))}
                    </span>
                    <label className="field-label">
                      Qty
                      <input
                        className="field-input w-24"
                        name="quantity"
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={line.quantity}
                        data-testid="event-menu-recipe-qty"
                      />
                    </label>
                    <label className="field-label">
                      Unit
                      <select
                        className="field-input w-28"
                        name="unit"
                        defaultValue={String(line.unit)}
                        data-testid="event-menu-recipe-unit"
                      >
                        {SELECTABLE_UNITS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="submit"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                    >
                      Save qty
                    </button>
                    {mismatch ? (
                      <span
                        className="ml-2 text-danger"
                        data-testid="event-menu-unit-mismatch"
                      >
                        recipe {String(line.unit)} vs stock{" "}
                        {String(catalog?.unit)} — not converted
                      </span>
                    ) : null}
                    {(() => {
                      const flag = suspectPrepQuantityFlag({
                        name: ingredientName(String(line.ingredientId)),
                        unit: String(line.unit),
                        quantity: Number(line.quantity) * servings,
                        servings,
                        suspect: /tpp unit looks wrong|keep 196/i.test(
                          String(
                            (line as { prepNotes?: string | null }).prepNotes ??
                              "",
                          ),
                        ),
                      });
                      return flag ? (
                        <span
                          className="ml-2 text-danger"
                          data-testid="suspect-prep-quantity"
                        >
                          {flag}
                        </span>
                      ) : null;
                    })()}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() =>
                        void removeLine({
                          docId: line._id,
                          version: line.version,
                          reason: "Removed from event menu recipe",
                        })
                      }
                    >
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={onAddIngredient}
        >
          <label className="field-label">
            Ingredient
            <select className="field-input w-48" name="ingredientId" required>
              <option value="">Select…</option>
              {(ingredients ?? [])
                .filter((row) => row.deletedAt == null)
                .map((row) => (
                  <option key={row._id} value={row._id}>
                    {row.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field-label">
            Per serving
            <input
              className="field-input w-24"
              name="quantity"
              type="number"
              min={0}
              step="any"
              defaultValue={1}
            />
          </label>
          <label className="field-label">
            Unit
            <select
              className="field-input w-28"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
            >
              {SELECTABLE_UNITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="btn btn-ghost"
            disabled={busy != null}
          >
            Add ingredient
          </button>
        </form>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink">Containers / pans</p>
        {panCounts.length === 0 ? (
          <p className="text-sm text-ink-3">
            No containers yet. Add a pan so headcount can count pieces.
          </p>
        ) : (
          <ul
            className="mt-1 space-y-1"
            data-testid="event-menu-container-count"
          >
            {panCounts.map((row) => (
              <li key={row.containerId} className="text-sm">
                {row.count} × {row.name} ({row.servingsPerContainer} servings
                each)
              </li>
            ))}
          </ul>
        )}
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          onSubmit={onAddContainer}
        >
          <label className="field-label">
            Container
            <input
              className="field-input w-40"
              name="containerName"
              placeholder="Hotel pan"
            />
          </label>
          <label className="field-label">
            Servings / pan
            <input
              className="field-input w-24"
              name="servingsPerContainer"
              type="number"
              min={1}
              defaultValue={20}
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost"
            disabled={busy != null}
          >
            Add container
          </button>
        </form>
      </div>
    </div>
  );
}
