import { RecipeImportCoordinator } from "../features/kitchen/import/RecipeImportCoordinator";
import { RecipeImportFinalizer } from "../features/kitchen/import/RecipeImportFinalizer";
import {
  countUnresolvedLines,
  type CatalogIngredient,
  type RecipeImportReviewState,
} from "../features/kitchen/import/RecipeImportTypes";
import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";
import { CapsuleIdempotencyKeyFactory } from "./CapsuleIdempotencyKeyFactory";
import {
  CapsuleRecipeStatusLoader,
  type CapsuleRecipeStatusReader,
} from "./CapsuleRecipeStatusLoader";
import { CapsuleRetiredRecipeEnterRecovery } from "./CapsuleRetiredRecipeEnterRecovery";

export interface CapsuleDocumentEnterOptions {
  sourceText: string;
  catalog?: readonly CatalogIngredient[];
  /**
   * Opt-in only. Recipe sheets (work/recipes photos, pesto, brine, sauce) are
   * Recipes — not Dishes. Dishes are production-sheet menu items with DishTask
   * lines underneath (work/list*.jpg). Never invent a Dish from a recipe title.
   */
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
 * Document → Capsule Recipe enter path using RecipeImport* + governed createVia.
 * Preview first; never auto-create unmatched ingredient lines unless approved.
 * Does not treat a recipe sheet as a Dish (see work/ production photos).
 */
export class CapsuleDocumentEnterCoordinator {
  private readonly importCoordinator = new RecipeImportCoordinator();
  private readonly retiredRecipeRecovery: CapsuleRetiredRecipeEnterRecovery;

  constructor(
    private readonly executor: CapsuleCommandExecutor,
    private readonly recipeStatusLoader: CapsuleRecipeStatusReader = new CapsuleRecipeStatusLoader(),
  ) {
    this.retiredRecipeRecovery = new CapsuleRetiredRecipeEnterRecovery(
      executor,
      recipeStatusLoader,
    );
  }

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
      name: review.name.trim(),
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
    // Document-hash idempotency can return a retired Recipe after wipe (#17).
    // Prefer Recipe.reinstate (same id); fall back to aliveN draft keys if needed.
    let recipeAliveGeneration = 0;
    const finalizer = new RecipeImportFinalizer({
      createIngredient: async (input) => {
        const suffix = `ingredient:${ingredientIndex}:${input.name}:alive${recipeAliveGeneration}`;
        ingredientIndex += 1;
        const result = await this.executor.execute({
          capabilityId: "Ingredient.introduce",
          args: { ...input },
          idempotencyKey: keys.forCapability("Ingredient.introduce", suffix),
        });
        return { docId: asDocId(result) };
      },
      createRecipe: async (input) => {
        const maxGenerations = 5;
        for (let generation = 0; generation < maxGenerations; generation += 1) {
          recipeAliveGeneration = generation;
          const result = await this.executor.execute({
            capabilityId: "Recipe.draft",
            args: { ...input },
            idempotencyKey: keys.forCapability(
              "Recipe.draft",
              generation === 0 ? "recipe" : `recipe:alive${generation}`,
            ),
          });
          const docId = asDocId(result);
          const writable =
            await this.retiredRecipeRecovery.ensureWritableRecipe(docId);
          if (writable != null) {
            return { docId: writable };
          }
        }
        throw new Error(
          `Refuse to enter: Recipe.draft idempotency only returned retired/missing ` +
            `recipes for document scope ${keys.scope} (reinstate/aliveN recovery failed). ` +
            `Do not silently attach lines to a retired recipe.`,
        );
      },
      createRecipeIngredient: async (input) => {
        const suffix = `line:${lineIndex}:alive${recipeAliveGeneration}`;
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
    // Opt-in only — never invent a Dish from a recipe sheet title.
    const introduceDish = options.introduceDish === true;
    let dishId: string | undefined;

    if (introduceDish) {
      const dishResult = await this.executor.execute({
        capabilityId: "Dish.introduce",
        args: {
          name: ready.name.trim(),
          portionSize: options.dishPortionSize ?? ready.yieldQuantity,
          portionUnit: options.dishPortionUnit ?? ready.yieldUnit,
          description: ready.description?.trim() || undefined,
          category: ready.category?.trim() || undefined,
        },
        idempotencyKey: keys.forCapability("Dish.introduce", "dish"),
      });
      dishId = asDocId(dishResult);
      await this.executor.execute({
        capabilityId: "DishRecipe.attach",
        args: {
          dishId,
          recipeId: saved.recipeId,
          yieldQuantity: ready.yieldQuantity,
          batchMultiplier: ready.batchMultiplier ?? 1,
          sortOrder: 0,
        },
        idempotencyKey: keys.forCapability("DishRecipe.attach", "link"),
      });
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
