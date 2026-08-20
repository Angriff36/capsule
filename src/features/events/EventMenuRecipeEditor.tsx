import { useMemo, useRef, useState, type FormEvent } from "react";
import {
  useCreateDishContainer,
  useCreateDishIngredient,
  useCreateIngredient,
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
import {
  EVENT_MENU_CONTAINER_NAMES,
  eventMenuContainerCountsForDish,
} from "./eventMenuContainers";
import {
  createdIngredientId,
  filterEventMenuRecipeIngredients,
  parseEventMenuCreateIngredient,
  resolveEventMenuRecipeIngredientId,
} from "./eventMenuRecipeIngredient";
import { suspectPrepQuantityFlag } from "./eventMenuSuspectQuantity";
import {
  createNameAfterGuardedInput,
  createNamePrefillFromSearch,
  recipeAddSubmitSource,
  recipeEditorFocusAfterCatalogPick,
  recipeEditorKeyOwner,
  recipeLineCommitAllowed,
  recipeSearchAfterEmptyBackspace,
  recipeSearchAfterFocus,
  recipeSearchAfterGuardedInput,
  recipeSearchAfterInput,
  recipeSearchCleared,
  recipeSearchFromPick,
  recipeSearchTrapAppliesTo,
  searchKeyCommitsRecipeLine,
  shouldPreventRecipeAddSubmitFromSearchKey,
  type RecipeEditorField,
  type RecipeSearchState,
} from "./eventMenuRecipeSearch";
import {
  isSelectAllChord,
  trapSingleKeyNav,
} from "../../app/shell/singleKeyNav";

type Props = {
  dishId: string;
  servings: number;
};

export function EventMenuRecipeEditor({ dishId, servings }: Props) {
  const lines = useListDishIngredient();
  const ingredients = useListIngredient();
  const containers = useListDishContainer();
  const addLine = useCreateDishIngredient();
  const createIngredient = useCreateIngredient();
  const adjustQuantity = useDishIngredientAdjustQuantity();
  const removeLine = useDishIngredientRemove();
  const defineContainer = useCreateDishContainer();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unit, setUnit] = useState("each");
  const [ingredientQuery, setIngredientQuery] = useState("");
  const [selectedIngredientId, setSelectedIngredientId] = useState("");
  const [createName, setCreateName] = useState(() =>
    createNamePrefillFromSearch(""),
  );
  const addQtyRef = useRef<HTMLInputElement>(null);
  const keyOwnerRef = useRef<RecipeEditorField>("other");
  const searchHeldEmptyRef = useRef(true);
  const searchStateRef = useRef<RecipeSearchState>(recipeSearchCleared());
  searchStateRef.current = {
    query: ingredientQuery,
    selectedIngredientId,
  };

  function rememberKeyOwner(field: RecipeEditorField) {
    keyOwnerRef.current = recipeEditorKeyOwner(field);
  }

  function applySearchState(state: RecipeSearchState, heldEmpty: boolean) {
    searchStateRef.current = state;
    searchHeldEmptyRef.current = heldEmpty;
    setIngredientQuery(state.query);
    setSelectedIngredientId(state.selectedIngredientId);
  }

  function applySearchDomInput(
    target: HTMLInputElement,
    nextValue: string,
    inputType?: string,
  ) {
    const result = recipeSearchAfterGuardedInput({
      current: searchStateRef.current,
      nextValue,
      focused: keyOwnerRef.current,
      heldEmpty: searchHeldEmptyRef.current,
      inputType,
    });
    if (target.value !== result.state.query) {
      target.value = result.state.query;
    }
    applySearchState(result.state, result.heldEmpty);
  }

  function onRecipeSearchFocus(event: { currentTarget: HTMLInputElement }) {
    rememberKeyOwner("search");
    const next = recipeSearchAfterFocus(searchStateRef.current);
    if (event.currentTarget.value !== next.query) {
      event.currentTarget.value = next.query;
    }
    applySearchState(next, next.query === "" || searchHeldEmptyRef.current);
  }

  function onRecipeSearchBlur(event: { currentTarget: HTMLInputElement }) {
    if (keyOwnerRef.current === "search") rememberKeyOwner("other");
    const next = recipeSearchAfterFocus(searchStateRef.current);
    if (event.currentTarget.value !== next.query) {
      event.currentTarget.value = next.query;
    }
  }

  function onCreateNameChange(event: {
    currentTarget: HTMLInputElement;
    target: { value: string };
  }) {
    const incoming = event.target.value;
    const focused = keyOwnerRef.current;
    setCreateName((current) => {
      const next = createNameAfterGuardedInput({
        current,
        nextValue: incoming,
        focused,
      });
      if (event.currentTarget.value !== next) {
        event.currentTarget.value = next;
      }
      return next;
    });
  }

  const rows = (lines ?? [])
    .filter((line) => line.deletedAt == null && line.dishId === dishId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const liveIngredients = useMemo(
    () =>
      (ingredients ?? [])
        .filter((row) => row.deletedAt == null)
        .map((row) => ({
          id: row._id,
          name: row.name,
          unit: String(row.unit),
          deletedAt: row.deletedAt,
          status: String(row.status ?? ""),
          canonicalIngredientId: row.canonicalIngredientId,
          mergedIntoIngredientId: row.mergedIntoIngredientId,
        })),
    [ingredients],
  );
  const matches = useMemo(
    () => filterEventMenuRecipeIngredients(liveIngredients, ingredientQuery),
    [ingredientQuery, liveIngredients],
  );
  const selectedIngredient = liveIngredients.find(
    (row) => row.id === selectedIngredientId,
  );
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

  async function addIngredientLine(ingredientId: string, quantity: number) {
    await addLine({
      dishId,
      ingredientId,
      quantity,
      unit: unit as (typeof UNIT_OF_MEASURE)[number],
      sortOrder: rows.length,
    });
    applySearchState(recipeSearchCleared(), true);
  }

  async function onAddIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as {
      tagName?: string;
      textContent?: string | null;
    } | null;
    const source = recipeAddSubmitSource(submitter);
    if (!recipeLineCommitAllowed(source)) return;
    if (
      searchKeyCommitsRecipeLine("Enter") ||
      searchKeyCommitsRecipeLine("End")
    ) {
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const quantity = Number(data.get("quantity") ?? 0);
    const ingredientId = resolveEventMenuRecipeIngredientId(
      liveIngredients,
      selectedIngredientId,
      ingredientQuery,
    );
    if (!ingredientId || !(quantity > 0)) {
      setError("Pick an ingredient and a per-serving quantity.");
      return;
    }
    setBusy("add-ingredient");
    setError(null);
    try {
      await addIngredientLine(ingredientId, quantity);
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

  async function onCreateIngredient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = parseEventMenuCreateIngredient({
      name: String(data.get("newIngredientName") ?? ""),
      unit: String(data.get("newIngredientUnit") ?? "each"),
      costRaw: String(data.get("newIngredientCost") ?? ""),
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const quantity = Number(data.get("createQuantity") ?? 1);
    setBusy("create-ingredient");
    setError(null);
    try {
      const created = await createIngredient({
        name: parsed.value.name,
        unit: parsed.value.unit,
        costPerUnit: parsed.value.costPerUnit,
      });
      const ingredientId = createdIngredientId(created);
      if (!ingredientId) {
        setError("Ingredient was created but no id came back.");
        return;
      }
      applySearchState(
        { query: parsed.value.name, selectedIngredientId: ingredientId },
        false,
      );
      setUnit(parsed.value.unit);
      if (quantity > 0) {
        await addLine({
          dishId,
          ingredientId,
          quantity,
          unit: parsed.value.unit,
          sortOrder: rows.length,
        });
        applySearchState(recipeSearchCleared(), true);
        setCreateName(createNamePrefillFromSearch(""));
        form.reset();
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the ingredient.",
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
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <form autoComplete="off" onSubmit={(event) => event.preventDefault()}>
            <label
              className="field-label"
              htmlFor="event-menu-recipe-ingredient-search"
            >
              Ingredient
              <input
                className="field-input w-48"
                type="search"
                role="searchbox"
                id="event-menu-recipe-ingredient-search"
                name="eventMenuRecipeCatalogSearch"
                onKeyDown={trapSingleKeyNav}
                placeholder="Search catalog…"
                autoComplete="off"
                data-testid="event-menu-recipe-ingredient-search"
                spellCheck={false}
                value={ingredientQuery}
                onChange={(event) => {
                  applySearchDomInput(event.currentTarget, event.target.value);
                }}
                onInput={(event) => {
                  applySearchDomInput(
                    event.currentTarget,
                    event.currentTarget.value,
                    (event.nativeEvent as InputEvent).inputType,
                  );
                }}
                onFocus={onRecipeSearchFocus}
                onBlur={onRecipeSearchBlur}
                onKeyDownCapture={(event) => {
                  if (!recipeSearchTrapAppliesTo("search")) return;
                  if (isSelectAllChord(event)) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.select();
                    return;
                  }
                  if (
                    event.key === "Backspace" &&
                    event.currentTarget.value === ""
                  ) {
                    event.preventDefault();
                    const next = recipeSearchAfterEmptyBackspace();
                    applySearchState(next, true);
                    event.currentTarget.value = "";
                    return;
                  }
                  if (shouldPreventRecipeAddSubmitFromSearchKey(event.key)) {
                    event.preventDefault();
                  }
                }}
              />
            </label>
          </form>
          <form
            className="flex flex-wrap items-end gap-2"
            autoComplete="off"
            onSubmit={onAddIngredient}
          >
            <label className="field-label" htmlFor="event-menu-recipe-add-qty">
              Per serving
              <input
                ref={addQtyRef}
                className="field-input w-24"
                id="event-menu-recipe-add-qty"
                name="quantity"
                type="number"
                min={0}
                step="any"
                defaultValue={1}
                data-testid="event-menu-recipe-add-qty"
                onMouseDown={(event) => {
                  rememberKeyOwner("qty");
                  event.currentTarget.focus();
                }}
                autoComplete="off"
                onFocus={() => rememberKeyOwner("qty")}
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
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy != null}
              data-testid="event-menu-create-ingredient"
              onClick={() => {
                const field = document.querySelector<HTMLInputElement>(
                  '[data-testid="event-menu-create-ingredient-name"]',
                );
                rememberKeyOwner("create-name");
                field?.focus();
              }}
            >
              Create ingredient
            </button>
          </form>
        </div>
        {selectedIngredient ? (
          <p
            className="mt-1 text-sm text-ink-2"
            data-testid="event-menu-recipe-ingredient-selected"
          >
            Selected {selectedIngredient.name}
          </p>
        ) : null}
        {ingredientQuery.trim() ? (
          matches.length > 0 ? (
            <ul
              className="mt-1 max-h-40 space-y-1 overflow-y-auto"
              data-testid="event-menu-recipe-ingredient-results"
            >
              {matches.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      const next = recipeSearchFromPick(row.id, row.name);
                      applySearchState(next, next.query === "");
                      if (row.unit) setUnit(String(row.unit));
                      if (recipeEditorFocusAfterCatalogPick() === "qty") {
                        rememberKeyOwner("qty");
                        addQtyRef.current?.focus();
                      }
                    }}
                  >
                    {row.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-ink-3">
              No catalog match for “{ingredientQuery.trim()}”. Create the
              ingredient here — cost may be $0.
            </p>
          )
        ) : (
          <p className="mt-1 text-sm text-ink-3">
            Type to search the catalog. The picker is not a fixed list of names.
          </p>
        )}
        <form
          className="mt-2 flex flex-wrap items-end gap-2"
          autoComplete="off"
          onSubmit={onCreateIngredient}
          data-testid="event-menu-create-ingredient-form"
        >
          <label
            className="field-label"
            htmlFor="event-menu-create-ingredient-name"
          >
            New ingredient
            <input
              className="field-input w-48"
              id="event-menu-create-ingredient-name"
              name="newIngredientName"
              type="text"
              value={createName}
              placeholder="Carne asada"
              required
              autoComplete="off"
              spellCheck={false}
              onKeyDown={trapSingleKeyNav}
              data-testid="event-menu-create-ingredient-name"
              onFocus={() => rememberKeyOwner("create-name")}
              onChange={onCreateNameChange}
            />
          </label>
          <label className="field-label">
            Stock unit
            <select
              className="field-input w-28"
              name="newIngredientUnit"
              defaultValue={unit}
            >
              {SELECTABLE_UNITS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Catalog cost
            <input
              className="field-input w-24"
              name="newIngredientCost"
              type="number"
              min={0}
              step="0.01"
              placeholder="0.00"
              data-testid="event-menu-create-ingredient-cost"
            />
          </label>
          <label className="field-label">
            Per serving
            <input
              className="field-input w-24"
              name="createQuantity"
              type="number"
              min={0}
              step="any"
              defaultValue={1}
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost"
            disabled={busy != null}
          >
            Create and add
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
              list="event-menu-container-names"
              placeholder="Hotel pan"
            />
            <datalist id="event-menu-container-names">
              {EVENT_MENU_CONTAINER_NAMES.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
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
