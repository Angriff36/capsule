import { IngredientCatalogMatcher } from "./IngredientCatalogMatcher";
import { RecipeTextParser } from "./RecipeTextParser";
import type {
  CatalogIngredient,
  RecipeImportReviewState,
  ReviewIngredientLine,
} from "./RecipeImportTypes";
import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

/**
 * Owns parse → match → editable review state for the import workbench.
 */
export class RecipeImportCoordinator {
  private readonly parser = new RecipeTextParser();
  private readonly matcher = new IngredientCatalogMatcher();

  parseAndMatch(
    source: string,
    catalog: readonly CatalogIngredient[],
  ): RecipeImportReviewState {
    const parsed = this.parser.parse(source);
    return {
      name: parsed.name,
      description: parsed.description,
      yieldQuantity: parsed.yieldQuantity,
      yieldUnit: parsed.yieldUnit,
      instructions: parsed.instructions,
      warnings: parsed.warnings,
      lines: this.matcher.matchAll(parsed.lines, catalog),
    };
  }

  updateLine(
    review: RecipeImportReviewState,
    index: number,
    patch: Partial<ReviewIngredientLine>,
  ): RecipeImportReviewState {
    const lines = review.lines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    return { ...review, lines };
  }

  removeLine(
    review: RecipeImportReviewState,
    index: number,
  ): RecipeImportReviewState {
    return {
      ...review,
      lines: review.lines.filter((_, i) => i !== index),
    };
  }

  bindCatalogIngredient(
    review: RecipeImportReviewState,
    index: number,
    ingredient: CatalogIngredient | null,
  ): RecipeImportReviewState {
    if (!ingredient) {
      return this.updateLine(review, index, {
        matchStatus: "new",
        matchedIngredientId: undefined,
        matchedIngredientName: undefined,
        createNew: true,
      });
    }
    return this.updateLine(review, index, {
      matchStatus: "matched",
      matchedIngredientId: ingredient.id,
      matchedIngredientName: ingredient.name,
      name: ingredient.name,
      createNew: false,
    });
  }

  setYieldUnit(
    review: RecipeImportReviewState,
    yieldUnit: UnitOfMeasure,
  ): RecipeImportReviewState {
    return { ...review, yieldUnit };
  }

  statusLabel(status: ReviewIngredientLine["matchStatus"]): string {
    return this.matcher.statusLabel(status);
  }
}
