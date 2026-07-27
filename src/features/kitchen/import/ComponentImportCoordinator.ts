import { ComponentCsvParser } from "./ComponentCsvParser";
import { IngredientCatalogMatcher } from "./IngredientCatalogMatcher";
import { ComponentTextParser } from "./ComponentTextParser";
import type {
  CatalogIngredient,
  ComponentImportReviewState,
  ComponentImportSourceKind,
  ReviewIngredientLine,
} from "./ComponentImportTypes";
import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

/**
 * Owns parse → match → editable review state for the import workbench.
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
  ): ComponentImportReviewState {
    const parsed = this.parser.parse(source);
    return this.toReview(parsed, catalog, sourceKind, sourceFilename);
  }

  parseTextFile(
    source: string,
    filename: string,
    catalog: readonly CatalogIngredient[],
  ): ComponentImportReviewState {
    const parsed = this.csvParser.parseTextFile(source, filename);
    return this.toReview(parsed, catalog, "text_file", filename);
  }

  parseCsvBundle(
    sheetCsv: string,
    linesCsv: string,
    catalog: readonly CatalogIngredient[],
    sheetFilename = "component_sheet.csv",
    linesFilename = "component_lines.csv",
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
    yieldUnit: UnitOfMeasure,
  ): ComponentImportReviewState {
    return { ...review, yieldUnit };
  }

  statusLabel(status: ReviewIngredientLine["matchStatus"]): string {
    return this.matcher.statusLabel(status);
  }

  firstUnresolvedIndex(review: ComponentImportReviewState): number {
    return review.lines.findIndex(
      (line) =>
        line.matchStatus !== "exact" &&
        line.matchStatus !== "confirmed_existing" &&
        line.matchStatus !== "confirmed_new",
    );
  }

  private toReview(
    parsed: ReturnType<ComponentTextParser["parse"]>,
    catalog: readonly CatalogIngredient[],
    sourceKind: ComponentImportSourceKind,
    sourceFilename?: string,
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
      lines: this.matcher.matchAll(parsed.lines, catalog),
    };
  }
}
