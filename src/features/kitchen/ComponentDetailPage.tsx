import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatCountNoun } from "../../lib/format";
import {
  useCreateComponentIngredient,
  useGetComponent,
  useGetPrepTask,
  useGetEvent,
  useListComponentImport,
  useListDish,
  useListDishComponent,
  useListIngredient,
  useListIngredientPriceObservation,
  useListPerson,
  useListComponentIngredient,
  useListComponentStep,
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
import { buildComponentSnapshotData } from "./componentSnapshot";
import { ComponentVersionHistoryPanel } from "./ComponentVersionHistoryPanel";
import { captureBeforeChange } from "./componentSnapshotCapture";
import { DraftRestoreBanner, useFormDraft } from "../../ui/formDraft";
import { ErrorState, Skeleton, StatusChip } from "../../ui/primitives";
import { useActionPrompt } from "../../ui/action-prompt";
import { formatStatusLabel } from "../../lib/statusLabels";
import { CulinaryEntityLink } from "./CulinaryEntityLink";
import { readableRecipeAmount } from "./RecipeNotes";
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
import { ComponentImportSourcePanel } from "./import/ComponentImportSourcePanel";
import {
  beginPendingOperation,
  confirmPendingOperation,
} from "../../lib/pendingOperationKey";
import { useRestoreComponentSnapshotSafely } from "../../lib/safeCulinaryOperations";
import { componentRestoreOutcome } from "./culinaryRecovery";
import { ComponentPrepContext, prepRecipeYield } from "./ComponentPrepContext";

const policy = new CulinaryLifecyclePolicy();
const UNITS = UNIT_OF_MEASURE;

function optional(value: FormDataEntryValue | null) {
  const result = String(value ?? "").trim();
  return result || undefined;
}

export function ComponentDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const prepTaskId = searchParams.get("prepTask") || undefined;
  const component = useRouteRecord(useGetComponent, id);
  const prepTask = useRouteRecord(useGetPrepTask, prepTaskId);
  const prepEvent = useRouteRecord(
    useGetEvent,
    prepTask?.componentId === id ? prepTask?.eventId : undefined,
  );
  useTrackRecent("Component", component?.name);
  const ingredients = useListIngredient();
  const priceObservations = useListIngredientPriceObservation();
  const lines = useListComponentIngredient();
  const steps = useListComponentStep();
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
  const restoreSnapshotCommand = useRestoreComponentSnapshotSafely();
  const snapshots = useListComponentSnapshot();
  const people = useListPerson();
  const authStatus = useAuthStatus();
  // Completed-import provenance: the original source this component came
  // from. Older native components have none — absence is not an error.
  // Culinary features use generated hooks only (integration guard), so the
  // tenant's imports are filtered to this component's completed import.
  const allImports = useListComponentImport();
  const sourceImport = useMemo(() => {
    const rows = (allImports ?? []).filter(
      (row: {
        resultingComponentId?: string | null;
        deletedAt?: number | null;
        status?: string;
      }) =>
        row.resultingComponentId === id &&
        row.deletedAt == null &&
        row.status === "completed",
    );
    return rows.length > 0
      ? rows.sort(
          (
            a: { completedAt?: number | null },
            b: { completedAt?: number | null },
          ) => (b.completedAt ?? 0) - (a.completedAt ?? 0),
        )[0]
      : null;
  }, [allImports, id]);
  const [editing, setEditing] = useState(false);
  const previewKey = JSON.stringify([id, prepTaskId, component?.yieldUnit]);
  const [yieldPreview, setYieldPreview] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const [showLineForm, setShowLineForm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [snapshotWarning, setSnapshotWarning] = useState<string | null>(null);
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
  const componentSteps = (steps ?? [])
    .filter(
      (step) => step.deletedAt == null && step.componentId === component._id,
    )
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a._creationTime - b._creationTime ||
        String(a._id).localeCompare(String(b._id)),
    );
  const methodInstructions = component.instructions?.trim();
  const methodMatchesSteps =
    componentSteps.length > 0 &&
    methodInstructions?.replace(/\s+/g, " ") ===
      componentSteps
        .map((step) => step.instruction.trim())
        .join(" ")
        .replace(/\s+/g, " ");
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
  const prepYield = prepRecipeYield(component, prepTask);
  const hasYieldPreview = yieldPreview?.key === previewKey;
  const targetYield = hasYieldPreview
    ? yieldPreview.value
    : prepYield == null
      ? ""
      : String(prepYield);
  const targetYieldNumber = Number(targetYield);
  const baseYield = Number(component.yieldQuantity);
  const scaleFactor =
    targetYield.trim() !== "" &&
    Number.isFinite(targetYieldNumber) &&
    targetYieldNumber >= 0 &&
    baseYield > 0
      ? targetYieldNumber / baseYield
      : null;
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
    setSnapshotWarning(null);
    await captureBeforeChange(
      () =>
        captureSnapshot({
          componentId: component._id,
          versionNumber: component.versionNumber,
          capturedByName: myName,
          changeSummary,
          snapshot: JSON.stringify(currentData),
        }),
      setSnapshotWarning,
    );
  };

  const restoreSnapshot = (snapshotId: string, versionLabel: string) => {
    void run("restore", async () => {
      await captureBefore(`Before restore to ${versionLabel}`);
      const scope = `component-restore:${component._id}`;
      const pending = beginPendingOperation(scope, {
        componentId: component._id,
        snapshotId,
      });
      const result = await restoreSnapshotCommand({
        ...pending.payload,
        operationKey: pending.key,
      } as never);
      confirmPendingOperation(scope);
      const outcome = componentRestoreOutcome(result);
      if (outcome.notice) setSnapshotWarning(outcome.notice);
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
      {snapshotWarning ? (
        <p className="mt-4 text-base text-warn" role="status">
          {snapshotWarning}
        </p>
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
        {prepTaskId ? (
          <ComponentPrepContext
            recipe={component}
            task={prepTask}
            event={prepEvent}
          />
        ) : null}
      </header>

      <div className="culinary-work-grid">
        <section className="culinary-section">
          <div className="culinary-section-heading">
            <h2>Composition</h2>
            <span>
              {lines === undefined
                ? "Loading…"
                : formatCountNoun(componentLines.length, "line")}
            </span>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field-label">
              Scale to yield ({String(component.yieldUnit)})
              <input
                type="number"
                min={0}
                step="any"
                className="input"
                placeholder={String(component.yieldQuantity)}
                value={targetYield}
                onChange={(event) =>
                  setYieldPreview({
                    key: previewKey,
                    value: event.target.value,
                  })
                }
                aria-label="Scale to yield"
              />
            </label>
            {scaleFactor != null ? (
              <>
                <span className="font-mono text-xs text-ink-3">
                  ×{" "}
                  {scaleFactor.toLocaleString(undefined, {
                    maximumSignificantDigits: 4,
                  })}{" "}
                  recipe · Preview quantities
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    setYieldPreview({ key: previewKey, value: "" })
                  }
                >
                  {prepTaskId ? "Recipe batch" : "Reset"}
                </button>
              </>
            ) : null}
            {hasYieldPreview && prepYield != null ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setYieldPreview(null)}
              >
                Use prep amount
              </button>
            ) : null}
          </div>
          {lines === undefined || ingredients === undefined ? (
            <p className="py-4 text-base text-ink-2" role="status">
              Loading ingredients…
            </p>
          ) : componentLines.length ? (
            <ul className="ingredient-list">
              {componentLines.map((line) => (
                <li key={line._id}>
                  <strong>
                    {readableRecipeAmount(
                      Number(line.quantity) * (scaleFactor ?? 1),
                      String(line.unit),
                    )}
                    {scaleFactor != null ? (
                      <span className="font-mono text-2xs text-ink-3">
                        {" "}
                        (base{" "}
                        {readableRecipeAmount(
                          Number(line.quantity),
                          String(line.unit),
                        )}
                        )
                      </span>
                    ) : null}
                  </strong>
                  <span>
                    <IngredientCatalogLabel
                      ingredientId={line.ingredientId}
                      ingredients={ingredients}
                      link
                      wrap
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
          {methodInstructions && !methodMatchesSteps ? (
            <div className="method-prose">{methodInstructions}</div>
          ) : null}
          {steps === undefined ? (
            <p className="py-4 text-base text-ink-2" role="status">
              Loading method steps…
            </p>
          ) : componentSteps.length ? (
            <ol className="divide-y divide-line" aria-label="Method steps">
              {componentSteps.map((step, index) => (
                <li key={step._id} className="flex min-w-0 gap-3 py-4">
                  <span className="font-mono text-base text-ink-2" aria-hidden>
                    {index + 1}.
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="whitespace-pre-wrap break-words text-base text-ink">
                      {step.instruction}
                    </p>
                    {step.durationMinutes != null ? (
                      <span className="text-sm text-ink-2">
                        {step.durationMinutes} min
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : !methodInstructions ? (
            <div className="document-empty">
              <p>No method recorded.</p>
              <span>
                Edit this draft to capture the source-backed instructions.
              </span>
            </div>
          ) : null}
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

      {sourceImport ? (
        <ComponentImportSourcePanel
          kind={sourceImport.sourceKind}
          filename={sourceImport.sourceFilename ?? undefined}
          rawText={sourceImport.rawSourceText ?? ""}
          csvSheetText={sourceImport.csvSheetText ?? undefined}
          csvLinesText={sourceImport.csvLinesText ?? undefined}
          importId={String(sourceImport._id)}
          status={sourceImport.status}
        />
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
