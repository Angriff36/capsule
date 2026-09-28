import { ComponentCsvParser } from "./ComponentCsvParser";
import { IngredientCatalogMatcher } from "./IngredientCatalogMatcher";
import { ComponentTextParser } from "./ComponentTextParser";
import {
  isLineResolved,
  type CatalogIngredient,
  type CatalogRecipe,
  type ComponentImportReviewState,
  type ComponentImportSourceKind,
  type ReviewIngredientLine,
} from "./ComponentImportTypes";
import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

/**
 * Owns parse → match → editable review state for the import workbench.
 * `recipes` is the recipe book: lines naming one of them become sub-recipe
 * lines instead of ingredients.
 */
export class ComponentImportCoordinator {
  private readonly parser = new ComponentTextParser();
  private readonly csvParser = new ComponentCsvParser();
  private readonly matcher = new IngredientCatalogMatcher();

  parseText(
    source: string,
    catalog: readonly CatalogIngredient[],
    sourceKind: ComponentImportSourceKind = "pasted_text",
    sourceFilename?: string,
    recipes: readonly CatalogRecipe[] = [],
  ): ComponentImportReviewState {
    const parsed = this.parser.parse(source);
    return this.toReview(parsed, catalog, sourceKind, sourceFilename, recipes);
  }

  parseTextFile(
    source: string,
    filename: string,
    catalog: readonly CatalogIngredient[],
    recipes: readonly CatalogRecipe[] = [],
  ): ComponentImportReviewState {
    const parsed = this.csvParser.parseTextFile(source, filename);
    return this.toReview(parsed, catalog, "text_file", filename, recipes);
  }

  parseCsvBundle(
    sheetCsv: string,
    linesCsv: string,
    catalog: readonly CatalogIngredient[],
    sheetFilename = "component_sheet.csv",
    linesFilename = "component_lines.csv",
    recipes: readonly CatalogRecipe[] = [],
  ): ComponentImportReviewState {
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
      recipes,
    );
    review.errors = bundle.errors.map(
      (error) => `${error.file} row ${error.row}: ${error.message}`,
    );
    return review;
  }

  updateLine(
    review: ComponentImportReviewState,
    index: number,
    patch: Partial<ReviewIngredientLine>,
  ): ComponentImportReviewState {
    const lines = review.lines.map((line, i) =>
      i === index ? { ...line, ...patch } : line,
    );
    return { ...review, lines };
  }

  removeLine(
    review: ComponentImportReviewState,
    index: number,
  ): ComponentImportReviewState {
    return {
      ...review,
      lines: review.lines.filter((_, i) => i !== index),
    };
  }

  /**
   * The line is a step of the method, not something to measure: it leaves
   * the line list and is added to the end of the method text.
   */
  moveLineToMethod(
    review: ComponentImportReviewState,
    index: number,
  ): ComponentImportReviewState {
    const line = review.lines[index];
    if (!line) return review;
    const method = review.instructions?.trim();
    return {
      ...this.removeLine(review, index),
      instructions: method ? `${method}\n${line.raw}` : line.raw,
    };
  }

  bindCatalogIngredient(
    review: ComponentImportReviewState,
    index: number,
    ingredient: CatalogIngredient | null,
  ): ComponentImportReviewState {
    if (!ingredient) {
      return this.updateLine(review, index, {
        matchStatus: "new",
        matchedIngredientId: undefined,
        matchedIngredientName: undefined,
        matchedComponentId: undefined,
        matchedComponentName: undefined,
        possibleMatchIds: [],
        possibleMatchNames: [],
        createNew: true,
      });
    }
    return this.updateLine(review, index, {
      matchStatus: "confirmed_existing",
      matchedIngredientId: ingredient.id,
      matchedIngredientName: ingredient.name,
      matchedComponentId: undefined,
      matchedComponentName: undefined,
      name: ingredient.name,
      possibleMatchIds: [],
      possibleMatchNames: [],
      createNew: false,
    });
  }

  /**
   * Links the line to a recipe from the recipe book (a sub-recipe), or with
   * null turns it back into an ingredient line that still needs a match.
   */
  bindSubrecipe(
    review: ComponentImportReviewState,
    index: number,
    recipe: CatalogRecipe | null,
  ): ComponentImportReviewState {
    if (!recipe) {
      return this.updateLine(review, index, {
        matchStatus: "unresolved",
        matchedComponentId: undefined,
        matchedComponentName: undefined,
        subrecipeHint: false,
        createNew: false,
      });
    }
    return this.updateLine(review, index, {
      matchStatus: "subrecipe",
      matchedComponentId: recipe.id,
      matchedComponentName: recipe.name,
      matchedIngredientId: undefined,
      matchedIngredientName: undefined,
      name: recipe.name,
      possibleMatchIds: [],
      possibleMatchNames: [],
      subrecipeHint: true,
      createNew: false,
    });
  }

  confirmExactLine(
    review: ComponentImportReviewState,
    index: number,
  ): ComponentImportReviewState {
    const line = review.lines[index];
    if (!line?.matchedIngredientId) return review;
    return this.updateLine(review, index, {
      matchStatus: "confirmed_existing",
      createNew: false,
    });
  }

  confirmNewLine(
    review: ComponentImportReviewState,
    index: number,
  ): ComponentImportReviewState {
    return this.updateLine(review, index, {
      matchStatus: "confirmed_new",
      matchedIngredientId: undefined,
      matchedIngredientName: undefined,
      createNew: true,
    });
  }

  setYieldUnit(
    review: ComponentImportReviewState,
    yieldUnit: UnitOfMeasure | null,
  ): ComponentImportReviewState {
    return { ...review, yieldUnit };
  }

  statusLabel(status: ReviewIngredientLine["matchStatus"]): string {
    return this.matcher.statusLabel(status);
  }

  firstUnresolvedIndex(review: ComponentImportReviewState): number {
    return review.lines.findIndex(
      (line) => line.matchStatus !== "exact" && !isLineResolved(line),
    );
  }

  private toReview(
    parsed: ReturnType<ComponentTextParser["parse"]>,
    catalog: readonly CatalogIngredient[],
    sourceKind: ComponentImportSourceKind,
    sourceFilename: string | undefined,
    recipes: readonly CatalogRecipe[],
  ): ComponentImportReviewState {
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
      lines: this.matcher.matchAll(parsed.lines, catalog, recipes),
    };
  }
}
