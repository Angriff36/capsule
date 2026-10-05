import type { ComponentImportCoordinator } from "./ComponentImportCoordinator";
import type {
  CatalogRecipe,
  ComponentImportReviewState,
  ReviewIngredientLine,
} from "./ComponentImportTypes";

/** A line is shown as a sub-recipe when it is linked or the source marks it. */
export function isSubrecipeLine(line: ReviewIngredientLine): boolean {
  return line.matchStatus === "subrecipe" || line.subrecipeHint === true;
}

/**
 * What kind of line this is: an ingredient to buy, another recipe from the
 * book, or a step that belongs in the method. The buttons switch between them.
 */
export function ComponentImportLineKindActions({
  review,
  index,
  coordinator,
  onReviewChange,
}: {
  review: ComponentImportReviewState;
  index: number;
  coordinator: ComponentImportCoordinator;
  onReviewChange: (review: ComponentImportReviewState) => void;
}) {
  const line = review.lines[index];
  return (
    <>
      {isSubrecipeLine(line) ? (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            onReviewChange(coordinator.bindSubrecipe(review, index, null))
          }
        >
          Treat as an ingredient
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            onReviewChange(
              coordinator.updateLine(review, index, {
                matchStatus: "unresolved",
                matchedIngredientId: undefined,
                matchedIngredientName: undefined,
                possibleMatchIds: [],
                possibleMatchNames: [],
                subrecipeHint: true,
                createNew: false,
              }),
            )
          }
        >
          Use a recipe from the book
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() =>
          onReviewChange(coordinator.moveLineToMethod(review, index))
        }
      >
        Move to method
      </button>
    </>
  );
}

/** Picks the recipe-book recipe a sub-recipe line uses. */
export function SubrecipePicker({
  review,
  index,
  coordinator,
  recipes,
  onReviewChange,
}: {
  review: ComponentImportReviewState;
  index: number;
  coordinator: ComponentImportCoordinator;
  recipes: readonly CatalogRecipe[];
  onReviewChange: (review: ComponentImportReviewState) => void;
}) {
  const line = review.lines[index];
  return (
    <label className="field-label">
      Recipe from the book
      <select
        value={line.matchedComponentId ?? ""}
        onChange={(event) => {
          const recipe = recipes.find((item) => item.id === event.target.value);
          onReviewChange(
            recipe
              ? coordinator.bindSubrecipe(review, index, recipe)
              : coordinator.updateLine(review, index, {
                  matchStatus: "unresolved",
                  matchedComponentId: undefined,
                  matchedComponentName: undefined,
                }),
          );
        }}
      >
        <option value="">Not in the recipe book yet</option>
        {recipes.map((recipe) => (
          <option key={recipe.id} value={recipe.id}>
            {recipe.name}
          </option>
        ))}
      </select>
      {line.matchedComponentId ? null : (
        <span className="text-sm text-ink-3">
          Pick the recipe this line uses. If it is not in the book yet, add it
          there first, or treat this line as an ingredient.
        </span>
      )}
    </label>
  );
}
