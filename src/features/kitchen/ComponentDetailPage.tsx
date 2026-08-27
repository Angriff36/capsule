import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateComponentIngredient,
  useGetComponent,
  useListDish,
  useListDishComponent,
  useListIngredient,
  useListIngredientPriceObservation,
  useListPerson,
  useListComponentIngredient,
  useListComponentSnapshot,
  useComponentIngredientAdjustQuantity,
  useComponentIngredientRemove,
  useComponentPublishVersion,
  useComponentPurge,
  useComponentRetract,
  useComponentReviseDraft,
  useCreateComponentSnapshot,
} from "../../lib/manifest-convex-react";
import { useTrackRecent } from "../../lib/recents";
import { useRouteRecord } from "../../lib/routeRecord";
import { useAuthStatus } from "../../lib/useAuthStatus";
import {
  buildComponentSnapshotData,
  planLineRestore,
  type ComponentSnapshotData,
} from "./componentSnapshot";
import { ComponentVersionHistoryPanel } from "./ComponentVersionHistoryPanel";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { formatStatusLabel } from "../../lib/statusLabels";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { IngredientCatalogLabel } from "./IngredientCatalogLabel";
import { IngredientOptionPicker } from "./IngredientOptionPicker";
import { CulinaryFailureBanner } from "./CulinaryFailureBanner";
import { CulinaryLifecyclePolicy } from "./CulinaryLifecyclePolicy";
import { KitchenBookNav } from "./KitchenBookNav";
import {
  latestPriceByIngredient,
  resolveIngredientPrice,
} from "./IngredientPriceHistory";
import { calculateComponentCost } from "./ComponentCostCalculator";
import { ComponentCostPanel } from "./ComponentCostPanel";
import {
  calculateComponentNutrition,
  toNutritionIngredient,
} from "./ComponentNutrition";
import { ComponentNutritionPanel } from "./ComponentNutritionPanel";
import {
  SELECTABLE_UNITS,
  UNIT_OF_MEASURE,
  unitOptionsFor,
} from "./import/UnitOfMeasureMapper";

const policy = new CulinaryLifecyclePolicy();
const UNITS = UNIT_OF_MEASURE;

function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

export function ComponentDetailPage() {
  const { id } = useParams();
  const component = useRouteRecord(useGetComponent, id);
  useTrackRecent("Component", component?.name);
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const lines = useListComponentIngredient();
  const dishes = useListDish();
  const dishComponents = useListDishComponent();
  const revise = useComponentReviseDraft();
  const publish = useComponentPublishVersion();
  const retract = useComponentRetract();
  const purge = useComponentPurge();
  const createLine = useCreateComponentIngredient();
  const adjustLine = useComponentIngredientAdjustQuantity();
  const removeLine = useComponentIngredientRemove();
  // Creation path: the governed create hook (ComponentSnapshot_createViaCapture),
  // not the entity-command hook which targets an existing doc via docId.
  const captureSnapshot = useCreateComponentSnapshot();
  const snapshots = useListComponentSnapshot();
  const people = useListPerson();
  const authStatus = useAuthStatus();
  const [editing, setEditing] = useState(false);
  const [targetYield, setTargetYield] = useState("");
  const [showLineForm, setShowLineForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt();
  const draftForm = useFormDraft(`component-revise:${id ?? "none"}`);

  if (!id) return <ErrorState title="Component not found" />;
  if (component === undefined)
    return (
      <div className="culinary-document space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-3/4" />
        <Skeleton className="h-64" />
      </div>
    );
  if (component === null || component.deletedAt != null)
    return (
      <ErrorState
        title="Component not found"
        detail="This component is unavailable or no longer exists."
      />
    );

  const componentLines = (lines ?? [])
    .filter(
      (line) => line.deletedAt == null && line.componentId === component._id,
    )
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const componentDishIds = new Set(
    (dishComponents ?? [])
      .filter(
        (line) => line.deletedAt == null && line.componentId === component._id,
      )
      .map((line) => line.dishId),
  );
  const componentDishes = (dishes ?? []).filter(
    (dish) => dish.deletedAt == null && componentDishIds.has(dish._id),
  );
  const actions = policy.componentActions(
    String(component.status),
    component.deletedAt,
  );
  const targetYieldNumber = Number(targetYield);
  const baseYield = Number(component.yieldQuantity);
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

  const myPersonId = authStatus?.personId ?? null;
  const me = (people ?? []).find(
    (person) => person._id === myPersonId && person.deletedAt == null,
  );
  const myName =
    [me?.givenName, me?.familyName].filter(Boolean).join(" ") || "Unknown";

  const currentData = buildComponentSnapshotData(
    component,
    componentLines,
    ingredientName,
  );

  // Snapshot the component's state BEFORE a modification, so history holds the
  // prior editions with author + timestamp. Capture failures never block edits.
  const captureBefore = async (changeSummary: string) => {
    try {
      await captureSnapshot({
        componentId: component._id,
        versionNumber: component.versionNumber,
        capturedByName: myName,
        changeSummary,
        snapshot: JSON.stringify(currentData),
      });
    } catch {
      // Non-fatal: the edit itself is the source of truth.
    }
  };

  const restoreSnapshot = (
    target: ComponentSnapshotData,
    versionLabel: string,
  ) => {
    void run("restore", async () => {
      await captureBefore(`Before restore to ${versionLabel}`);
      await revise({
        docId: component._id,
        name: target.name,
        yieldQuantity: target.yieldQuantity,
        yieldUnit: target.yieldUnit as (typeof UNITS)[number],
        batchMultiplier: target.batchMultiplier,
        servesPerYield: target.servesPerYield,
        category: target.category || undefined,
        cuisine: target.cuisine || undefined,
        description: target.description || undefined,
        instructions: target.instructions || undefined,
        version: component.version,
      });
      const plan = planLineRestore(currentData, target);
      for (const add of plan.add) {
        await createLine({
          componentId: component._id,
          ingredientId: add.ingredientId,
          quantity: add.quantity,
          unit: add.unit as (typeof UNITS)[number],
          sortOrder: 0,
          prepNotes: add.prepNotes || undefined,
        });
      }
      for (const change of plan.adjust) {
        const line = componentLines.find(
          (l) => l.ingredientId === change.ingredientId,
        );
        if (!line) continue;
        await adjustLine({
          docId: line._id,
          quantity: change.quantity,
          unit: change.unit as (typeof UNITS)[number],
          version: line.version,
        });
      }
      for (const ingredientId of plan.remove) {
        const line = componentLines.find(
          (l) => l.ingredientId === ingredientId,
        );
        if (!line) continue;
        await removeLine({
          docId: line._id,
          reason: `Restored to ${versionLabel}`,
          version: line.version,
        });
      }
    });
  };
  const latestPrices = latestPriceByIngredient(priceObservations ?? []);
  const componentCost = calculateComponentCost({
    lines: componentLines.map((line) => ({
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
    batchMultiplier: Number(component.batchMultiplier),
    yieldQuantity: Number(component.yieldQuantity),
  });
  const servesPerYield = Number(
    (component as { servesPerYield?: number }).servesPerYield ?? 1,
  );
  const componentNutrition = calculateComponentNutrition({
    lines: componentLines.map((line) => ({
      id: line._id,
      ingredientId: line.ingredientId,
      quantity: Number(line.quantity),
      unit: line.unit,
    })),
    ingredients: (ingredients ?? [])
      .filter((ingredient) => ingredient.deletedAt == null)
      .map(toNutritionIngredient),
    servesPerYield,
  });
  const nutritionCoverageNote =
    componentNutrition.totalLineCount === 0
      ? "Add ingredient lines with nutrition to build a per-portion panel."
      : componentNutrition.isComplete
        ? `Based on all ${componentNutrition.totalLineCount} lines.`
        : `Based on ${componentNutrition.measuredLineCount} of ${componentNutrition.totalLineCount} lines — add nutrition to the remaining ingredients for a complete panel.`;

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
      await captureBefore("Revised draft");
      await revise({
        docId: component._id,
        name: String(data.get("name") ?? "").trim(),
        yieldQuantity: Number(data.get("yieldQuantity")),
        yieldUnit: String(data.get("yieldUnit")) as (typeof UNITS)[number],
        batchMultiplier: Number(data.get("batchMultiplier")),
        servesPerYield: Number(data.get("servesPerYield")),
        category: optional(data.get("category")),
        cuisine: optional(data.get("cuisine")),
        description: optional(data.get("description")),
        instructions: optional(data.get("instructions")),
        version: component.version,
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
      await captureBefore("Added ingredient line");
      await createLine({
        componentId: component._id,
        ingredientId: String(data.get("ingredientId")),
        quantity: Number(data.get("quantity")),
        unit: String(data.get("unit")) as (typeof UNITS)[number],
        sortOrder: componentLines.length,
        prepNotes: optional(data.get("prepNotes")),
      });
      form.reset();
    });
  };

  const invokeLifecycle = (key: string) => {
    void run(key, async () => {
      const args = { docId: component._id, version: component.version };
      if (key === "publishVersion") await publish(args);
      if (key === "retract") await retract(args);
      if (key === "purge") await purge(args);
    });
  };

  return (
    <article className="culinary-document culinary-document-compact culinary-studio">
      <Link to="/kitchen/components" className="culinary-studio-back">
        ← Component index
      </Link>
      <KitchenBookNav />
      {host}
      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}
      <header className="culinary-header-compact">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">
              Component · Edition {component.versionNumber} ·{" "}
              {formatStatusLabel(String(component.status))}
            </p>
            <h1 className="culinary-title-compact">{component.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {component.status === "draft" ? (
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
        {component.description ? (
          <p className="culinary-lead">{component.description}</p>
        ) : null}
        <dl className="culinary-facts culinary-facts-compact">
          <div>
            <dt>Status</dt>
            <dd>
              <StatusChip status={String(component.status)} />
            </dd>
          </div>
          <div>
            <dt>Yield</dt>
            <dd>
              {component.yieldQuantity} {String(component.yieldUnit)}
            </dd>
          </div>
          <div>
            <dt>Serves per yield</dt>
            <dd>
              {(component as { servesPerYield?: number }).servesPerYield ?? 1}{" "}
              guests
            </dd>
          </div>
          <div>
            <dt>Batch</dt>
            <dd>× {component.batchMultiplier}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{component.category || "—"}</dd>
          </div>
          <div>
            <dt>Cuisine</dt>
            <dd>{component.cuisine || "—"}</dd>
          </div>
        </dl>
      </header>

      <ComponentCostPanel
        summary={componentCost}
        yieldUnit={component.yieldUnit}
        loading={
          ingredients === undefined ||
          lines === undefined ||
          priceObservations === undefined
        }
      />

      <ComponentNutritionPanel
        heading="Per-portion nutrition"
        portionLabel={`per portion · serves ${servesPerYield}`}
        totals={componentNutrition.perPortion}
        coverageNote={nutritionCoverageNote}
        loading={ingredients === undefined || lines === undefined}
      />

      <div className="culinary-work-grid">
        <section className="culinary-section">
          <div className="culinary-section-heading">
            <h2>Composition</h2>
            <span>{formatCountNoun(componentLines.length, "line")}</span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field-label">
              Scale to yield ({String(component.yieldUnit)})
              <input
                type="number"
                min={0.01}
                step="0.01"
                className="input"
                placeholder={String(component.yieldQuantity)}
                value={targetYield}
                onChange={(event) => setTargetYield(event.target.value)}
                aria-label="Scale to yield"
              />
            </label>
            {scaleFactor != null ? (
              <>
                <span className="font-mono text-xs text-ink-3">
                  × {scaleFactor.toFixed(2)} of the canonical component (preview
                  only — component is unchanged)
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
          {componentLines.length ? (
            <ul className="ingredient-list">
              {componentLines.map((line) => (
                <li key={line._id}>
                  <strong>
                    {scaled(Number(line.quantity))} {String(line.unit)}
                    {scaleFactor != null ? (
                      <span className="font-mono text-2xs text-ink-3">
                        {" "}
                        (base {line.quantity})
                      </span>
                    ) : null}
                  </strong>
                  <span>
                    <IngredientCatalogLabel
                      ingredientId={line.ingredientId}
                      ingredients={ingredients}
                      link
                    />
                  </span>
                  <span>{line.prepNotes || "No preparation note"}</span>
                  <div className="culinary-line-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={busy != null}
                      onClick={() => {
                        void (async () => {
                          const values = await prompt.askFields({
                            title: "Adjust quantity",
                            description: `New quantity for ${ingredientName(
                              line.ingredientId,
                            )} (${String(line.unit)}).`,
                            fields: [
                              {
                                name: "quantity",
                                label: "Quantity",
                                inputType: "number",
                                defaultValue: String(line.quantity),
                                required: true,
                              },
                            ],
                            confirmLabel: "Adjust quantity",
                          });
                          if (!values) return;
                          const quantity = Number(values.quantity);
                          if (!Number.isFinite(quantity) || quantity <= 0)
                            return;
                          await run(`adjust:${line._id}`, async () => {
                            await captureBefore("Adjusted ingredient line");
                            await adjustLine({
                              docId: line._id,
                              quantity,
                              unit: line.unit,
                              version: line.version,
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
                          const reason = (
                            await prompt.askReason({
                              title: "Remove ingredient line",
                              description: `Remove ${ingredientName(
                                line.ingredientId,
                              )} from this component.`,
                              label: "Removal reason",
                              confirmLabel: "Remove line",
                              tone: "danger",
                            })
                          )?.trim();
                          if (!reason) return;
                          await run(`remove:${line._id}`, async () => {
                            await captureBefore("Removed ingredient line");
                            await removeLine({
                              docId: line._id,
                              reason,
                              version: line.version,
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
          ) : (
            <div className="document-empty">
              <p>No ingredient lines yet.</p>
              <span>
                You can still publish this component — ingredient lines are
                optional.
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
              <label className="field-label sm:col-span-2">
                Ingredient
                <IngredientOptionPicker ingredients={ingredients} required />
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
                  {SELECTABLE_UNITS.map((unit) => (
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
          {component.instructions ? (
            <div className="method-prose">{component.instructions}</div>
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
          <ComponentEditForm
            component={component}
            busy={busy === "revise"}
            onSubmit={submitRevision}
            formRef={draftForm.formRef}
          />
        </>
      ) : null}

      <ComponentVersionHistoryPanel
        componentId={component._id}
        snapshots={snapshots as never}
        currentData={currentData}
        canRestore={component.status === "draft"}
        busy={busy != null}
        onRestore={restoreSnapshot}
      />

      <section className="culinary-section">
        <div className="culinary-section-heading">
          <h2>Dish uses</h2>
          <span>
            {formatCountNoun(componentDishes.length, "dish", "dishes")}
          </span>
        </div>
        {componentDishes.length ? (
          <ul className="dish-uses">
            {componentDishes.map((dish) => (
              <li
                key={dish._id}
                className="flex items-center justify-between border-b border-line py-3"
              >
                <CulinaryEntityLink kind="dish" id={dish._id}>
                  <span className="font-display text-xl">{dish.name}</span>
                </CulinaryEntityLink>
                <span className="font-mono text-2xs text-ink-3">
                  {dish.portionSize} {String(dish.portionUnit)} ·{" "}
                  {formatStatusLabel(String(dish.status))}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="document-empty">
            <p>No plated dish uses this component.</p>
            <span>
              Create one from the Dishes index when the component is ready for
              service.
            </span>
          </div>
        )}
      </section>
    </article>
  );
}

function ComponentEditForm({
  component,
  busy,
  onSubmit,
  formRef,
}: {
  component: any;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  formRef: (node: HTMLFormElement | null) => void;
}) {
  return (
    <form className="culinary-edit-form" onSubmit={onSubmit} ref={formRef}>
      <div className="culinary-create-heading">
        <div>
          <p className="eyebrow">Draft editor</p>
          <h2 className="font-display text-xl">Revise component</h2>
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
            defaultValue={component.name}
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
            defaultValue={component.yieldQuantity}
            required
          />
        </label>
        <label className="field-label">
          Yield unit
          <select
            name="yieldUnit"
            className="input"
            defaultValue={component.yieldUnit}
          >
            {unitOptionsFor(component.yieldUnit).map((unit) => (
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
            defaultValue={component.batchMultiplier}
            required
          />
        </label>
        <label className="field-label">
          Serves per yield
          <input
            name="servesPerYield"
            type="number"
            min={1}
            step={1}
            className="input"
            defaultValue={
              (component as { servesPerYield?: number }).servesPerYield ?? 1
            }
            required
          />
        </label>
        <label className="field-label">
          Category
          <input
            name="category"
            className="input"
            defaultValue={component.category ?? ""}
          />
        </label>
        <label className="field-label">
          Cuisine
          <input
            name="cuisine"
            className="input"
            defaultValue={component.cuisine ?? ""}
          />
        </label>
        <label className="field-label sm:col-span-2">
          Description
          <textarea
            name="description"
            className="input min-h-20 py-2"
            defaultValue={component.description ?? ""}
          />
        </label>
        <label className="field-label sm:col-span-2">
          Method
          <textarea
            name="instructions"
            className="input min-h-40 py-2"
            defaultValue={component.instructions ?? ""}
          />
        </label>
      </div>
    </form>
  );
}
