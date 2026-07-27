import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

export type IngredientMatchStatus =
  "exact" | "possible" | "new" | "confirmed_existing" | "confirmed_new";

export type ComponentImportSourceKind =
  "pasted_text" | "text_file" | "csv_bundle";

export interface ParsedIngredientLine {
  raw: string;
  name: string;
  quantity: number;
  unit: UnitOfMeasure;
  unitRaw: string;
  prepNotes?: string;
}

export interface ParsedComponentDraft {
  name: string;
  description?: string;
  category?: string;
  cuisine?: string;
  yieldQuantity: number;
  yieldUnit: UnitOfMeasure;
  batchMultiplier?: number;
  instructions?: string;
  lines: ParsedIngredientLine[];
  warnings: string[];
}

export interface ReviewIngredientLine extends ParsedIngredientLine {
  matchStatus: IngredientMatchStatus;
  matchedIngredientId?: string;
  matchedIngredientName?: string;
  possibleMatchIds: string[];
  possibleMatchNames: string[];
  /** When true, finalize will call Ingredient_createViaIntroduce. */
  createNew: boolean;
  /** Set when a durable ComponentImportLine row exists. */
  importLineId?: string;
}

export interface ComponentImportReviewState {
  importId?: string;
  sourceKind: ComponentImportSourceKind;
  sourceFilename?: string;
  name: string;
  description?: string;
  category?: string;
  cuisine?: string;
  yieldQuantity: number;
  yieldUnit: UnitOfMeasure;
  batchMultiplier: number;
  instructions?: string;
  lines: ReviewIngredientLine[];
  warnings: string[];
  errors: string[];
}

export interface CatalogIngredient {
  id: string;
  name: string;
  unit?: string;
  deletedAt?: number | null;
}

export function isLineResolved(line: ReviewIngredientLine): boolean {
  if (
    line.matchStatus === "exact" ||
    line.matchStatus === "confirmed_existing"
  ) {
    return Boolean(line.matchedIngredientId);
  }
  if (line.matchStatus === "confirmed_new") {
    return line.createNew;
  }
  return false;
}

export function countUnresolvedLines(
  lines: readonly ReviewIngredientLine[],
): number {
  return lines.filter((line) => !isLineResolved(line)).length;
}

export function reviewIsReady(review: ComponentImportReviewState): boolean {
  const name = review.name.trim();
  if (!name || review.yieldQuantity <= 0 || review.lines.length === 0) {
    return false;
  }
  return countUnresolvedLines(review.lines) === 0;
}
