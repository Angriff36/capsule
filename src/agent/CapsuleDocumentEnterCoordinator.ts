import { RecipeImportCoordinator } from "../features/kitchen/import/RecipeImportCoordinator";
import { RecipeImportFinalizer } from "../features/kitchen/import/RecipeImportFinalizer";
import {
  countUnresolvedLines,
  type CatalogIngredient,
  type RecipeImportReviewState,
} from "../features/kitchen/import/RecipeImportTypes";
import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";
import { CapsuleIdempotencyKeyFactory } from "./CapsuleIdempotencyKeyFactory";

export interface CapsuleDocumentEnterOptions {
  sourceText: string;
  catalog?: readonly CatalogIngredient[];
  /** When true (default), introduce a Dish linked to the new recipe. */
  introduceDish?: boolean;
  dishPortionSize?: number;
  dishPortionUnit?: string;
  /**
   * Required to create ingredients for non-exact lines.
   * Default false — refuse write until preview is approved.
   */
  approveUnresolvedAsNew?: boolean;
}

export interface CapsuleDocumentPreviewResult {
  review: RecipeImportReviewState;
  unresolvedLineCount: number;
  safeToEnterWithoutApproval: boolean;
  warnings: string[];
}

export interface CapsuleDocumentEnterResult {
  recipeId: string;
  createdIngredientIds: string[];
  lineIds: string[];
  dishId?: string;
  idempotencyScope: string;
}

function asDocId(result: unknown): string {
  if (
    result &&
    typeof result === "object" &&
    "docId" in result &&
    typeof (result as { docId: unknown }).docId === "string"
  ) {
    return (result as { docId: string }).docId;
  }
  throw new Error("Command result missing docId");
}

/**
 * Document → Capsule kitchen enter path using RecipeImport* + governed createVia.
 * Preview first; never auto-create unmatched ingredient lines unless approved.
 */
export class CapsuleDocumentEnterCoordinator {
  private readonly importCoordinator = new RecipeImportCoordinator();

  constructor(private readonly executor: CapsuleCommandExecutor) {}

  previewFromText(options: {
    sourceText: string;
    catalog?: readonly CatalogIngredient[];
  }): CapsuleDocumentPreviewResult {
    const review = this.importCoordinator.parseText(
      options.sourceText,
      options.catalog ?? [],
    );
    const unresolvedLineCount = countUnresolvedLines(review.lines);
    return {
      review,
      unresolvedLineCount,
      safeToEnterWithoutApproval: unresolvedLineCount === 0,
      warnings: [
        ...review.warnings,
        ...(unresolvedLineCount > 0
          ? [
              `${unresolvedLineCount} ingredient line(s) need review. ` +
                `Re-run enter with approveUnresolvedAsNew only after preview looks correct.`,
            ]
          : []),
      ],
    };
  }

  async enterFromText(
    options: CapsuleDocumentEnterOptions,
  ): Promise<CapsuleDocumentEnterResult> {
    const keys = CapsuleIdempotencyKeyFactory.fromDocument(options.sourceText);
    const preview = this.previewFromText({
      sourceText: options.sourceText,
      catalog: options.catalog,
    });
    const review = preview.review;

    if (
      preview.unresolvedLineCount > 0 &&
      options.approveUnresolvedAsNew !== true
    ) {
      throw new Error(
        `Refuse to enter: ${preview.unresolvedLineCount} unresolved ingredient line(s). ` +
          `Call previewFromText / --preview, fix the document or catalog matches, ` +
          `then pass approveUnresolvedAsNew (CLI: --approve-new) only for approved creates.`,
      );
    }

    const ready = {
      ...review,
      lines: review.lines.map((line) => {
        if (line.matchStatus === "exact" && line.matchedIngredientId) {
          return line;
        }
        if (options.approveUnresolvedAsNew === true) {
          return {
            ...line,
            matchStatus: "confirmed_new" as const,
            createNew: true,
            matchedIngredientId: undefined,
          };
        }
        return line;
      }),
    };

    let ingredientIndex = 0;
    let lineIndex = 0;
    const finalizer = new RecipeImportFinalizer({
      createIngredient: async (input) => {
        const suffix = `ingredient:${ingredientIndex}:${input.name}`;
        ingredientIndex += 1;
        const result = await this.executor.execute({
          capabilityId: "Ingredient.introduce",
          args: { ...input },
          idempotencyKey: keys.forCapability("Ingredient.introduce", suffix),
        });
        return { docId: asDocId(result) };
      },
      createRecipe: async (input) => {
        const result = await this.executor.execute({
          capabilityId: "Recipe.draft",
          args: { ...input },
          idempotencyKey: keys.forCapability("Recipe.draft", "recipe"),
        });
        return { docId: asDocId(result) };
      },
      createRecipeIngredient: async (input) => {
        const suffix = `line:${lineIndex}`;
        lineIndex += 1;
        const result = await this.executor.execute({
          capabilityId: "RecipeIngredient.add",
          args: { ...input },
          idempotencyKey: keys.forCapability("RecipeIngredient.add", suffix),
        });
        return { docId: asDocId(result) };
      },
    });

    const saved = await finalizer.finalize(ready);
    const introduceDish = options.introduceDish !== false;
    let dishId: string | undefined;

    if (introduceDish) {
      const dishResult = await this.executor.execute({
        capabilityId: "Dish.introduce",
        args: {
          recipeId: saved.recipeId,
          name: ready.name.trim(),
          portionSize: options.dishPortionSize ?? ready.yieldQuantity,
          portionUnit: options.dishPortionUnit ?? ready.yieldUnit,
          description: ready.description?.trim() || undefined,
          category: ready.category?.trim() || undefined,
        },
        idempotencyKey: keys.forCapability("Dish.introduce", "dish"),
      });
      dishId = asDocId(dishResult);
    }

    return {
      recipeId: saved.recipeId,
      createdIngredientIds: saved.createdIngredientIds,
      lineIds: saved.lineIds,
      dishId,
      idempotencyScope: keys.scope,
    };
  }
}
