import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

export type IngredientMatchStatus = "matched" | "partial" | "new";

export interface ParsedIngredientLine {
  raw: string;
  name: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitRaw: string;
  prepNotes?: string;
}

export interface ParsedRecipeDraft {
  name: string;
  description?: string;
  yieldQuantity: number;
  yieldUnit: UnitOfMeasure;
  instructions?: string;
  lines: ParsedIngredientLine[];
  warnings: string[];
}

export interface ReviewIngredientLine extends ParsedIngredientLine {
  matchStatus: IngredientMatchStatus;
  matchedIngredientId?: string;
  matchedIngredientName?: string;
  /** When true, finalize will call Ingredient_createViaIntroduce. */
  createNew: boolean;
}

export interface RecipeImportReviewState {
  name: string;
  description?: string;
  yieldQuantity: number;
  yieldUnit: UnitOfMeasure;
  instructions?: string;
  lines: ReviewIngredientLine[];
  warnings: string[];
}

export interface CatalogIngredient {
  id: string;
  name: string;
  unit?: string;
  deletedAt?: number | null;
}
