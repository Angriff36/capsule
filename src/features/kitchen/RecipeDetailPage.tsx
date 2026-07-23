import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCreateRecipeIngredient,
  useGetRecipe,
  useListDish,
  useListDishRecipe,
  useListIngredient,
  useListIngredientPriceObservation,
  useListRecipeIngredient,
  useRecipeIngredientAdjustQuantity,
  useRecipeIngredientRemove,
  useRecipePublishVersion,
  useRecipeReinstate,
  useRecipeRetire,
  useRecipeRetract,
  useRecipeReviseDraft,
} from "../../lib/manifest-convex-react";
import { useTrackRecent } from "../../lib/recents";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { KitchenBookNav } from "./KitchenBookNav";
import {
  latestPriceByIngredient,
  resolveIngredientPrice,
} from "./IngredientPriceHistory";
import { calculateRecipeCost } from "./RecipeCostCalculator";
import { RecipeCostPanel } from "./RecipeCostPanel";
import { UNIT_OF_MEASURE } from "./import/UnitOfMeasureMapper";

const policy = new CulinaryLifecyclePolicy();
const UNITS = UNIT_OF_MEASURE;

function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

export function RecipeDetailPage() {
  const { id } = useParams();
  const recipe = useGetRecipe(id ?? "skip");
  useTrackRecent("Recipe", recipe?.name);
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const lines = useListRecipeIngredient();
  const dishes = useListDish();
  const dishRecipes = useListDishRecipe();
  const revise = useRecipeReviseDraft();
  const publish = useRecipePublishVersion();
  const retract = useRecipeRetract();
  const retire = useRecipeRetire();
  const reinstate = useRecipeReinstate();
  const createLine = useCreateRecipeIngredient();
  const adjustLine = useRecipeIngredientAdjustQuantity();
  const removeLine = useRecipeIngredientRemove();
  const [editing, setEditing] = useState(false);
  const [targetYield, setTargetYield] = useState("");
  const [showLineForm, setShowLineForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const draftForm = useFormDraft(`recipe-revise:${id ?? "none"}`);

  if (!id) return <ErrorState title="Recipe not found" />;
  if (recipe === undefined)
    return (
      <div className="culinary-document space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-3/4" />
        <Skeleton className="h-64" />
      </div>
    );
  if (recipe === null || recipe.deletedAt != null)
    return (
      <ErrorState
        title="Recipe not found"
        detail="This recipe is unavailable or no longer exists."
      />
    );

  const recipeLines = (lines ?? [])
    .filter((line) => line.deletedAt == null && line.recipeId === recipe._id)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const recipeDishIds = new Set(
    (dishRecipes ?? [])
      .filter((line) => line.deletedAt == null && line.recipeId === recipe._id)
      .map((line) => line.dishId),
  );
  const recipeDishes = (dishes ?? []).filter(
    (dish) => dish.deletedAt == null && recipeDishIds.has(dish._id),
  );
  const actions = policy.recipeActions(String(recipe.status));
  const targetYieldNumber = Number(targetYield);
  const baseYield = Number(recipe.yieldQuantity);
  const scaleFactor =
    targetYield.trim() !== "" &&
    Number.isFinite(targetYieldNumber) &&
    targetYieldNumber > 0 &&
    baseYield > 0
      ? targetYieldNumber / baseYield
      : null;
  const scaled = (quantity: number) => {
    const value = quantity * (scaleFactor ?? 1);
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  };
  const ingredientName = (ingredientId: string) =>
    ingredients?.find((ingredient) => ingredient._id === ingredientId)?.name ??
    "Unknown ingredient";
  const latestPrices = latestPriceByIngredient(priceObservations ?? []);
  const recipeCost = calculateRecipeCost({
    lines: recipeLines.map((line) => ({
      id: line._id,
      ingredientId: line.ingredientId,
      quantity: Number(line.quantity),
      unit: line.unit,
    })),
    ingredients: (ingredients ?? [])
      .filter((ingredient) => ingredient.deletedAt == null)
      .map((ingredient) => {
        const price = resolveIngredientPrice(
          {
            id: ingredient._id,
            unit: ingredient.unit,
            costPerUnit: ingredient.costPerUnit,
          },
          latestPrices.get(ingredient._id),
        );
        return {
          id: ingredient._id,
          name: ingredient.name,
          unit: price.unit as typeof ingredient.unit,
          costPerUnit: price.costPerUnit,
        };
      }),
    batchMultiplier: Number(recipe.batchMultiplier),
    yieldQuantity: Number(recipe.yieldQuantity),
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

  const submitRevision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run("revise", async () => {
      await revise({
        docId: recipe._id,
        name: String(data.get("name") ?? "").trim(),
        yieldQuantity: Number(data.get("yieldQuantity")),
        yieldUnit: String(data.get("yieldUnit")) as (typeof UNITS)[number],
        batchMultiplier: Number(data.get("batchMultiplier")),
        category: optional(data.get("category")),
        cuisine: optional(data.get("cuisine")),
        description: optional(data.get("description")),
        instructions: optional(data.get("instructions")),
        version: recipe.version,
      });
      draftForm.clear();
      setEditing(false);
    });
  };

  const submitLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run("line", async () => {
      await createLine({
        recipeId: recipe._id,
        ingredientId: String(data.get("ingredientId")),
        quantity: Number(data.get("quantity")),
        unit: String(data.get("unit")) as (typeof UNITS)[number],
        sortOrder: recipeLines.length,
        prepNotes: optional(data.get("prepNotes")),
      });
      form.reset();
    });
  };

  const invokeLifecycle = (key: string) => {
    const reason =
      key === "retire" ? window.prompt("Retirement reason")?.trim() : undefined;
    if (key === "retire" && !reason) return;
    void run(key, async () => {
      const args = { docId: recipe._id, version: recipe.version };
      if (key === "publishVersion") await publish(args);
      if (key === "retract") await retract(args);
      if (key === "retire") await retire({ ...args, reason: reason! });
      if (key === "reinstate") await reinstate(args);
    });
  };

  return (
    <article className="culinary-document culinary-document-compact">
      <Link
        to="/kitchen/recipes"
        className="text-[12px] text-ink-3 hover:text-ink"
      >
        ← Recipe index
      </Link>
      <KitchenBookNav />
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">
              Recipe · Edition {recipe.versionNumber} · {String(recipe.status)}
            </p>
            <h1 className="culinary-title-compact">{recipe.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {recipe.status === "draft" ? (
              <button
                className="btn btn-ghost"
                onClick={() => setEditing((value) => !value)}
              >
                {editing ? "Close editor" : "Edit draft"}
              </button>
            ) : null}
            {actions.map((action) => (
              <button
                key={action.key}
                className={
                  action.key === "publishVersion"
                    ? "btn btn-primary"
                    : "btn btn-ghost"
                }
                disabled={busy != null}
                onClick={() => invokeLifecycle(action.key)}
              >
                {busy === action.key ? "Working…" : action.label}
              </button>
            ))}
          </div>
        </div>
        {recipe.description ? (
          <p className="culinary-lead">{recipe.description}</p>
        ) : null}
        <dl className="culinary-facts culinary-facts-compact">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusChip status={String(recipe.status)} />
            </dd>
          </div>
          <div>
            <dt>Yield</dt>
            <dd>
              {recipe.yieldQuantity} {String(recipe.yieldUnit)}
            </dd>
          </div>
          <div>
            <dt>Batch</dt>
            <dd>× {recipe.batchMultiplier}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{recipe.category || "—"}</dd>
          </div>
          <div>
            <dt>Cuisine</dt>
            <dd>{recipe.cuisine || "—"}</dd>
          </div>
        </dl>
      </header>

      <RecipeCostPanel
        summary={recipeCost}
        yieldUnit={recipe.yieldUnit}
        loading={
          ingredients === undefined ||
          lines === undefined ||
          priceObservations === undefined
        }
      />

      <div className="culinary-work-grid">
        <section className="culinary-section">
          <div className="culinary-section-heading">
            <h2>Composition</h2>
            <span>{recipeLines.length} lines</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field-label">
              Scale to yield ({String(recipe.yieldUnit)})
              <input
                type="number"
                min={0.01}
                step="0.01"
                className="input"
                placeholder={String(recipe.yieldQuantity)}
                value={targetYield}
                onChange={(event) => setTargetYield(event.target.value)}
                aria-label="Scale to yield"
              />
            </label>
            {scaleFactor != null ? (
              <>
                <span className="font-mono text-[11px] text-ink-3">
                  × {scaleFactor.toFixed(2)} of the canonical recipe (preview
                  only — recipe is unchanged)
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setTargetYield("")}
                >
                  Reset
                </button>
              </>
            ) : null}
          </div>
          {recipeLines.length ? (
            <ul className="ingredient-list">
              {recipeLines.map((line) => (
                <li key={line._id}>
                  <strong>
                    {scaled(Number(line.quantity))} {String(line.unit)}
                    {scaleFactor != null ? (
                      <span className="font-mono text-[10px] text-ink-3">
                        {" "}
                        (base {line.quantity})
                      </span>
                    ) : null}
                  </strong>
                  <span>
                    <CulinaryEntityLink
                      kind="ingredient"
                      id={line.ingredientId}
                    >
                      {ingredientName(line.ingredientId)}
                    </CulinaryEntityLink>
                  </span>
                  <span>{line.prepNotes || "No preparation note"}</span>
                  <div className="culinary-line-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => {
                        const quantity = Number(
                          window.prompt("Quantity", String(line.quantity)),
                        );
                        if (!Number.isFinite(quantity) || quantity <= 0) return;
                        void run(`adjust:${line._id}`, async () => {
                          await adjustLine({
                            docId: line._id,
                            quantity,
                            unit: line.unit,
                            version: line.version,
                          });
                        });
                      }}
                    >
                      Adjust
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => {
                        const reason = window.prompt("Removal reason")?.trim();
                        if (!reason) return;
                        void run(`remove:${line._id}`, async () => {
                          await removeLine({
                            docId: line._id,
                            reason,
                            version: line.version,
                          });
                        });
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="document-empty">
              <p>No ingredient lines yet.</p>
              <span>
                Publication remains governed by the generated Recipe command;
                this screen does not invent an ingredient prerequisite.
              </span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowLineForm((value) => !value)}
          >
            {showLineForm ? "Hide add line form" : "Add ingredient line"}
          </button>

          {showLineForm ? (
            <form className="culinary-line-form" onSubmit={submitLine}>
              <label className="field-label">
                Ingredient
                <select name="ingredientId" className="input" required>
                  <option value="">Select ingredient</option>
                  {(ingredients ?? [])
                    .filter(
                      (ingredient) =>
                        ingredient.deletedAt == null &&
                        ingredient.status === "active",
                    )
                    .map((ingredient) => (
                      <option key={ingredient._id} value={ingredient._id}>
                        {ingredient.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field-label">
                Quantity
                <input
                  name="quantity"
                  type="number"
                  min={0.01}
                  step="0.01"
                  defaultValue={1}
                  className="input"
                  required
                />
              </label>
              <label className="field-label">
                Unit
                <select name="unit" className="input">
                  {UNITS.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </select>
              </label>
              <label className="field-label">
                Preparation note
                <input name="prepNotes" className="input" />
              </label>
              <button
                className="btn btn-primary self-end"
                disabled={busy != null || !ingredients?.length}
              >
                {busy === "line" ? "Adding…" : "Add line"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="culinary-section">
          <div className="culinary-section-heading">
            <h2>Method</h2>
          </div>
          {recipe.instructions ? (
            <div className="method-prose">{recipe.instructions}</div>
          ) : (
            <div className="document-empty">
              <p>No method recorded.</p>
              <span>
                Edit this draft to capture the source-backed instructions.
              </span>
            </div>
          )}
        </section>
      </div>

      {editing ? (
        <>
          <DraftRestoreBanner
            draft={draftForm.draft}
            onRestore={draftForm.restore}
            onDiscard={draftForm.discard}
          />
          <RecipeEditForm
            recipe={recipe}
            busy={busy === "revise"}
            onSubmit={submitRevision}
            formRef={draftForm.formRef}
          />
        </>
      ) : null}

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Dish uses</h2>
          <span>{recipeDishes.length} dishes</span>
        </div>
        {recipeDishes.length ? (
          <ul className="dish-uses">
            {recipeDishes.map((dish) => (
              <li
                key={dish._id}
                className="flex items-center justify-between border-b border-line py-3"
              >
                <CulinaryEntityLink kind="dish" id={dish._id}>
                  <span className="font-display text-xl">{dish.name}</span>
                </CulinaryEntityLink>
                <span className="font-mono text-[10px] text-ink-3">
                  {dish.portionSize} {String(dish.portionUnit)} · {dish.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="document-empty">
            <p>No plated dish uses this recipe.</p>
            <span>
              Create one from the Dishes index when the recipe is ready for
              service.
            </span>
          </div>
        )}
      </section>
    </article>
  );
}

function RecipeEditForm({
  recipe,
  busy,
  onSubmit,
  formRef,
}: {
  recipe: any;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  formRef: (node: HTMLFormElement | null) => void;
}) {
  return (
    <form className="culinary-edit-form" onSubmit={onSubmit} ref={formRef}>
      <div className="culinary-create-heading">
        <div>
          <p className="eyebrow">Draft editor</p>
          <h2 className="font-display text-2xl">Revise recipe</h2>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save draft"}
        </button>
      </div>
      <div className="culinary-create-grid">
        <label className="field-label sm:col-span-2">
          Name
          <input
            name="name"
            className="input"
            defaultValue={recipe.name}
            required
          />
        </label>
        <label className="field-label">
          Yield
          <input
            name="yieldQuantity"
            type="number"
            min={0.01}
            step="0.01"
            className="input"
            defaultValue={recipe.yieldQuantity}
            required
          />
        </label>
        <label className="field-label">
          Yield unit
          <select
            name="yieldUnit"
            className="input"
            defaultValue={recipe.yieldUnit}
          >
            {UNITS.map((unit) => (
              <option key={unit}>{unit}</option>
            ))}
          </select>
        </label>
        <label className="field-label">
          Batch multiplier
          <input
            name="batchMultiplier"
            type="number"
            min={0.01}
            step="0.01"
            className="input"
            defaultValue={recipe.batchMultiplier}
            required
          />
        </label>
        <label className="field-label">
          Category
          <input
            name="category"
            className="input"
            defaultValue={recipe.category ?? ""}
          />
        </label>
        <label className="field-label">
          Cuisine
          <input
            name="cuisine"
            className="input"
            defaultValue={recipe.cuisine ?? ""}
          />
        </label>
        <label className="field-label sm:col-span-2">
          Description
          <textarea
            name="description"
            className="input min-h-20 py-2"
            defaultValue={recipe.description ?? ""}
          />
        </label>
        <label className="field-label sm:col-span-2">
          Method
          <textarea
            name="instructions"
            className="input min-h-40 py-2"
            defaultValue={recipe.instructions ?? ""}
          />
        </label>
      </div>
    </form>
  );
}
