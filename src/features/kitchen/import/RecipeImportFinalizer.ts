import type { UnitOfMeasure } from "./UnitOfMeasureMapper";
import type { RecipeImportReviewState } from "./RecipeImportTypes";

export interface CreateIngredientInput {
  name: string;
  unit: UnitOfMeasure;
  costPerUnit: number;
  allergens?: string[];
  category?: string;
}

export interface CreateRecipeInput {
  name: string;
  yieldQuantity: number;
  yieldUnit: UnitOfMeasure;
  batchMultiplier?: number;
  category?: string;
  cuisine?: string;
  description?: string;
  instructions?: string;
}

export interface CreateRecipeIngredientInput {
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
  sortOrder?: number;
  prepNotes?: string;
}

export interface RecipeImportCommandPorts {
  createIngredient: (
    input: CreateIngredientInput,
  ) => Promise<{ docId: string }>;
  createRecipe: (input: CreateRecipeInput) => Promise<{ docId: string }>;
  createRecipeIngredient: (
    input: CreateRecipeIngredientInput,
  ) => Promise<{ docId: string }>;
}

export interface RecipeImportFinalizeResult {
  recipeId: string;
  createdIngredientIds: string[];
  lineIds: string[];
}

/**
 * Finalizes a reviewed import draft through generated createVia commands only.
 */
export class RecipeImportFinalizer {
  constructor(private readonly ports: RecipeImportCommandPorts) {}

  async finalize(
    review: RecipeImportReviewState,
  ): Promise<RecipeImportFinalizeResult> {
    const name = review.name.trim();
    if (!name) throw new Error("Recipe name is required");
    if (review.yieldQuantity <= 0) {
      throw new Error("Recipe yield quantity must be positive");
    }
    if (review.lines.length === 0) {
      throw new Error("Add at least one ingredient line before saving");
    }

    const createdIngredientIds: string[] = [];
    const ingredientIds: string[] = [];

    for (const line of review.lines) {
      if (line.quantity <= 0) {
        throw new Error(`Quantity must be positive for ${line.name}`);
      }
      if (line.createNew || !line.matchedIngredientId) {
        const created = await this.ports.createIngredient({
          name: line.name.trim(),
          unit: line.unit,
          costPerUnit: 0,
          allergens: [],
        });
        createdIngredientIds.push(created.docId);
        ingredientIds.push(created.docId);
      } else {
        ingredientIds.push(line.matchedIngredientId);
      }
    }

    const recipe = await this.ports.createRecipe({
      name,
      yieldQuantity: review.yieldQuantity,
      yieldUnit: review.yieldUnit,
      batchMultiplier: 1,
      description: review.description?.trim() || undefined,
      instructions: review.instructions?.trim() || undefined,
    });

    const lineIds: string[] = [];
    for (let index = 0; index < review.lines.length; index += 1) {
      const line = review.lines[index];
      const created = await this.ports.createRecipeIngredient({
        recipeId: recipe.docId,
        ingredientId: ingredientIds[index],
        quantity: line.quantity,
        unit: line.unit,
        sortOrder: index + 1,
        prepNotes: line.prepNotes?.trim() || undefined,
      });
      lineIds.push(created.docId);
    }

    return {
      recipeId: recipe.docId,
      createdIngredientIds,
      lineIds,
    };
  }
}
