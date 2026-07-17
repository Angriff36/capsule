import { RecipeCsvParser } from "./RecipeCsvParser";
import { IngredientCatalogMatcher } from "./IngredientCatalogMatcher";
import { RecipeTextParser } from "./RecipeTextParser";
import type {
  CatalogIngredient,
  RecipeImportReviewState,
  RecipeImportSourceKind,
  ReviewIngredientLine,
} from "./RecipeImportTypes";
import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

/**
 * Owns parse → match → editable review state for the import workbench.
 */
export class RecipeImportCoordinator {
  private readonly parser = new RecipeTextParser();
  private readonly csvParser = new RecipeCsvParser();
  private readonly matcher = new IngredientCatalogMatcher();

  parseText(
    source: string,
    catalog: readonly CatalogIngredient[],
    sourceKind: RecipeImportSourceKind = "pasted_text",
    sourceFilename?: string,
  ): RecipeImportReviewState {
    const parsed = this.parser.parse(source);
    return this.toReview(parsed, catalog, sourceKind, sourceFilename);
  }

  parseTextFile(
    source: string,
    filename: string,
    catalog: readonly CatalogIngredient[],
  ): RecipeImportReviewState {
    const parsed = this.csvParser.parseTextFile(source, filename);
    return this.toReview(parsed, catalog, "text_file", filename);
  }

  parseCsvBundle(
    sheetCsv: string,
    linesCsv: string,
    catalog: readonly CatalogIngredient[],
    sheetFilename = "recipe_sheet.csv",
    linesFilename = "recipe_lines.csv",
  ): RecipeImportReviewState {
    const bundle = this.csvParser.parseBundle(
      sheetCsv,
      linesCsv,
      sheetFilename,
      linesFilename,
    );
    const review = this.toReview(
      bundle.draft,
      catalog,
      bundle.sourceKind,
      `${sheetFilename} + ${linesFilename}`,
    );
    review.errors = bundle.errors.map(
      (error) => `${error.file} row ${error.row}: ${error.message}`,
    );
    return review;
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
        possibleMatchIds: [],
        possibleMatchNames: [],
        createNew: true,
      });
    }
    return this.updateLine(review, index, {
      matchStatus: "confirmed_existing",
      matchedIngredientId: ingredient.id,
      matchedIngredientName: ingredient.name,
      name: ingredient.name,
      possibleMatchIds: [],
      possibleMatchNames: [],
      createNew: false,
    });
  }

  confirmExactLine(
    review: RecipeImportReviewState,
    index: number,
  ): RecipeImportReviewState {
    const line = review.lines[index];
    if (!line?.matchedIngredientId) return review;
    return this.updateLine(review, index, {
      matchStatus: "confirmed_existing",
      createNew: false,
    });
  }

  confirmNewLine(
    review: RecipeImportReviewState,
    index: number,
  ): RecipeImportReviewState {
    return this.updateLine(review, index, {
      matchStatus: "confirmed_new",
      matchedIngredientId: undefined,
      matchedIngredientName: undefined,
      createNew: true,
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

  firstUnresolvedIndex(review: RecipeImportReviewState): number {
    return review.lines.findIndex(
      (line) =>
        line.matchStatus !== "exact" &&
        line.matchStatus !== "confirmed_existing" &&
        line.matchStatus !== "confirmed_new",
    );
  }

  private toReview(
    parsed: ReturnType<RecipeTextParser["parse"]>,
    catalog: readonly CatalogIngredient[],
    sourceKind: RecipeImportSourceKind,
    sourceFilename?: string,
  ): RecipeImportReviewState {
    return {
      sourceKind,
      sourceFilename,
      name: parsed.name,
      description: parsed.description,
      category: parsed.category,
      cuisine: parsed.cuisine,
      yieldQuantity: parsed.yieldQuantity,
      yieldUnit: parsed.yieldUnit,
      batchMultiplier: parsed.batchMultiplier ?? 1,
      instructions: parsed.instructions,
      warnings: parsed.warnings,
      errors: [],
      lines: this.matcher.matchAll(parsed.lines, catalog),
    };
  }
}
