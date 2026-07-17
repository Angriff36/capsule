import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  useCreateIngredient,
  useCreateRecipe,
  useCreateRecipeIngredient,
  useListIngredient,
} from "../../../lib/manifest-convex-react";
import { CulinaryFailureBanner } from "../CulinaryFailureBanner";
import { KitchenBookNav } from "../KitchenBookNav";
import { recipePath } from "../kitchenRoutes";
import { RecipeImportCoordinator } from "./RecipeImportCoordinator";
import { RecipeImportFinalizer } from "./RecipeImportFinalizer";
import type { RecipeImportReviewState } from "./RecipeImportTypes";
import { UNIT_OF_MEASURE, type UnitOfMeasure } from "./UnitOfMeasureMapper";

const SAMPLE = `One-Pot Chili

A low-fat chili that is easy to clean up and microwave-friendly.

Yield: 6 servings

Ingredients:
1 lb lean ground turkey
1 small onion, chopped
1/4 cup green bell pepper, chopped
1 can (15 oz) pinto beans, rinsed and drained
2 tsp chili powder
1 cup water

Instructions:
1. Brown the turkey in a large pot.
2. Add onion and pepper; cook until soft.
3. Stir in beans, chili powder, and water.
4. Simmer 15 minutes.`;

const coordinator = new RecipeImportCoordinator();

export function RecipeImportPage() {
  const navigate = useNavigate();
  const ingredients = useListIngredient();
  const createIngredient = useCreateIngredient();
  const createRecipe = useCreateRecipe();
  const createRecipeIngredient = useCreateRecipeIngredient();
  const [source, setSource] = useState(SAMPLE);
  const [review, setReview] = useState<RecipeImportReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const catalog = useMemo(
    () =>
      (ingredients ?? []).map((item) => ({
        id: String(item._id),
        name: String(item.name),
        unit: item.unit != null ? String(item.unit) : undefined,
        deletedAt: item.deletedAt as number | null | undefined,
      })),
    [ingredients],
  );

  const newIngredientCount =
    review?.lines.filter((line) => line.createNew).length ?? 0;

  const parseSource = () => {
    setFailure(null);
    setReview(coordinator.parseAndMatch(source, catalog));
  };

  const finalize = async () => {
    if (!review) return;
    setFailure(null);
    setBusy(true);
    try {
      const finalizer = new RecipeImportFinalizer({
        createIngredient: (input) =>
          createIngredient(input) as Promise<{ docId: string }>,
        createRecipe: (input) =>
          createRecipe(input) as Promise<{ docId: string }>,
        createRecipeIngredient: (input) =>
          createRecipeIngredient(input) as Promise<{ docId: string }>,
      });
      const saved = await finalizer.finalize(review);
      navigate(recipePath(saved.recipeId));
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recipe-book-stage recipe-import-page">
      <KitchenBookNav />
      <header className="recipe-import-header">
        <div>
          <p className="eyebrow">Culinary book · Import</p>
          <h1 className="display-title mt-2">Recipe import</h1>
          <p className="mt-3 max-w-150 text-ink-2">
            Paste a recipe, review the structured draft, then save through
            generated Ingredient and Recipe commands.
          </p>
        </div>
        <div className="recipe-import-actions">
          <Link to="/kitchen/recipes" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="button" className="btn btn-ghost" onClick={parseSource}>
            Parse
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!review || busy || review.lines.length === 0}
            onClick={() => void finalize()}
          >
            {busy ? "Saving…" : "Save and edit"}
          </button>
        </div>
      </header>

      {failure ? (
        <div className="mt-4">
          <CulinaryFailureBanner error={failure} />
        </div>
      ) : null}

      <div className="recipe-import-split">
        <section className="recipe-import-pane" aria-label="Source text">
          <div className="recipe-import-pane-head">
            <h2>Your inputs</h2>
            <span className="font-mono text-[11px] text-ink-3">Plain text</span>
          </div>
          <textarea
            className="recipe-import-source"
            value={source}
            onChange={(event) => setSource(event.target.value)}
            spellCheck={false}
            rows={28}
          />
        </section>

        <section className="recipe-import-pane" aria-label="Structured review">
          <div className="recipe-import-pane-head">
            <h2>Capsule draft</h2>
            {review ? (
              <span className="recipe-import-badge">
                {newIngredientCount} new ingredient
                {newIngredientCount === 1 ? "" : "s"}
              </span>
            ) : (
              <span className="font-mono text-[11px] text-ink-3">
                Parse to review
              </span>
            )}
          </div>

          {!review ? (
            <div className="recipe-import-empty">
              <p className="eyebrow">Waiting</p>
              <h3 className="font-display text-3xl">
                Structure the house book entry.
              </h3>
              <p>
                Parsing stays in the browser. Nothing is written until you save
                through the generated createVia commands.
              </p>
            </div>
          ) : (
            <div className="recipe-import-review">
              {review.warnings.length ? (
                <ul className="recipe-import-warnings">
                  {review.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <label className="field-label">
                Recipe name
                <input
                  value={review.name}
                  onChange={(event) =>
                    setReview({ ...review, name: event.target.value })
                  }
                />
              </label>

              <div className="recipe-import-yield">
                <label className="field-label">
                  Yield
                  <input
                    type="number"
                    min={0.01}
                    step="any"
                    value={review.yieldQuantity}
                    onChange={(event) =>
                      setReview({
                        ...review,
                        yieldQuantity: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field-label">
                  Unit
                  <select
                    value={review.yieldUnit}
                    onChange={(event) =>
                      setReview(
                        coordinator.setYieldUnit(
                          review,
                          event.target.value as UnitOfMeasure,
                        ),
                      )
                    }
                  >
                    {UNIT_OF_MEASURE.map((unit) => (
                      <option key={unit} value={unit}>
                        {unit}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field-label">
                Description
                <textarea
                  rows={3}
                  value={review.description ?? ""}
                  onChange={(event) =>
                    setReview({
                      ...review,
                      description: event.target.value || undefined,
                    })
                  }
                />
              </label>

              <div className="recipe-import-lines-head">
                <h3>Components</h3>
                <span className="font-mono text-[11px] text-ink-3">
                  {review.lines.length} lines
                </span>
              </div>

              <ul className="recipe-import-lines">
                {review.lines.map((line, index) => (
                  <li key={`${line.raw}-${index}`}>
                    <div className="recipe-import-line-meta">
                      <span
                        className={`recipe-import-status is-${line.matchStatus}`}
                      >
                        {coordinator.statusLabel(line.matchStatus)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() =>
                          setReview(coordinator.removeLine(review, index))
                        }
                      >
                        Remove
                      </button>
                    </div>
                    <div className="recipe-import-line-grid">
                      <label className="field-label">
                        Ingredient
                        <input
                          value={line.name}
                          onChange={(event) =>
                            setReview(
                              coordinator.updateLine(review, index, {
                                name: event.target.value,
                                createNew: true,
                                matchStatus: "new",
                                matchedIngredientId: undefined,
                                matchedIngredientName: undefined,
                              }),
                            )
                          }
                        />
                      </label>
                      <label className="field-label">
                        Match catalog
                        <select
                          value={line.matchedIngredientId ?? ""}
                          onChange={(event) => {
                            const id = event.target.value;
                            const item =
                              catalog.find((entry) => entry.id === id) ?? null;
                            setReview(
                              coordinator.bindCatalogIngredient(
                                review,
                                index,
                                item,
                              ),
                            );
                          }}
                        >
                          <option value="">Create new ingredient</option>
                          {catalog.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Qty
                        <input
                          type="number"
                          min={0.01}
                          step="any"
                          value={line.quantity}
                          onChange={(event) =>
                            setReview(
                              coordinator.updateLine(review, index, {
                                quantity: Number(event.target.value),
                              }),
                            )
                          }
                        />
                      </label>
                      <label className="field-label">
                        Unit
                        <select
                          value={line.unit}
                          onChange={(event) =>
                            setReview(
                              coordinator.updateLine(review, index, {
                                unit: event.target.value as UnitOfMeasure,
                                unitRaw: event.target.value,
                              }),
                            )
                          }
                        >
                          {UNIT_OF_MEASURE.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field-label">
                      Prep notes
                      <input
                        value={line.prepNotes ?? ""}
                        onChange={(event) =>
                          setReview(
                            coordinator.updateLine(review, index, {
                              prepNotes: event.target.value || undefined,
                            }),
                          )
                        }
                      />
                    </label>
                  </li>
                ))}
              </ul>

              <label className="field-label">
                Instructions
                <textarea
                  rows={8}
                  value={review.instructions ?? ""}
                  onChange={(event) =>
                    setReview({
                      ...review,
                      instructions: event.target.value || undefined,
                    })
                  }
                />
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
