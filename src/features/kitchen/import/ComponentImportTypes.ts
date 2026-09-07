import type { UnitOfMeasure } from "./UnitOfMeasureMapper";

export type IngredientMatchStatus =
  /** Stored durable state: no local decision was ever recorded for this line. */
  | "unresolved"
  | "exact"
  | "possible"
  | "new"
  | "confirmed_existing"
  | "confirmed_new";

export type ComponentImportSourceKind =
  "pasted_text" | "text_file" | "csv_bundle";

export interface ParsedIngredientLine {
  raw: string;
  name: string;
  /** null = the source stated no amount; review must correct before finalize. */
  quantity: number | null;
  /** null = the source unit is unrecognized; unitRaw keeps what it said. */
  unit: UnitOfMeasure | null;
  unitRaw: string;
  prepNotes?: string;
}

export interface ParsedComponentDraft {
  name: string;
  description?: string;
  category?: string;
  cuisine?: string;
  yieldQuantity: number | null;
  yieldUnit: UnitOfMeasure | null;
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
  /** Durable optimistic-concurrency revision; set after create/load from storage. */
  reviewRevision?: number;
  sourceKind: ComponentImportSourceKind;
  sourceFilename?: string;
  /**
   * Original source text of a durable review (raw paste/sheet CSV primary
   * text plus the separately recoverable CSV pair). Read-only provenance:
   * corrections never rewrite these.
   */
  rawSourceText?: string;
  csvSheetText?: string;
  csvLinesText?: string;
  name: string;
  description?: string;
  category?: string;
  cuisine?: string;
  yieldQuantity: number | null;
  yieldUnit: UnitOfMeasure | null;
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

/**
 * A measured amount is missing when it is absent, non-finite (bad edit), or
 * not positive. Shared by review readiness and finalizer validation so both
 * agree on what "incomplete" means.
 */
export function isMissingQuantity(value: number | null): boolean {
  return value == null || !Number.isFinite(value) || value <= 0;
}

export interface ReviewMeasurementIssue {
  /** null = header-level issue (yield), otherwise the review line index. */
  lineIndex: number | null;
  field: "quantity" | "unit" | "yieldQuantity" | "yieldUnit";
  message: string;
}

/**
 * Measurement gaps are correction issues, not fabricated defaults: a missing
 * yield or unrecognized unit never becomes "1 portion" / "each". The review
 * stays saveable while these exist; only finalization requires correction.
 */
export function reviewMeasurementIssues(
  review: ComponentImportReviewState,
): ReviewMeasurementIssue[] {
  const issues: ReviewMeasurementIssue[] = [];
  if (isMissingQuantity(review.yieldQuantity)) {
    issues.push({
      lineIndex: null,
      field: "yieldQuantity",
      message: "Yield amount is missing. Enter how much the formula produces.",
    });
  }
  if (review.yieldUnit == null) {
    issues.push({
      lineIndex: null,
      field: "yieldUnit",
      message:
        "Yield unit is missing or not recognized. Choose the unit the formula produces.",
    });
  }
  review.lines.forEach((line, index) => {
    if (isMissingQuantity(line.quantity)) {
      issues.push({
        lineIndex: index,
        field: "quantity",
        message: `Amount is missing for “${line.name}”. Enter the source amount.`,
      });
    }
    if (line.unit == null) {
      const unitRaw = line.unitRaw.trim();
      issues.push({
        lineIndex: index,
        field: "unit",
        message:
          unitRaw !== ""
            ? `Source unit “${unitRaw}” for “${line.name}” is not recognized. Choose the correct unit.`
            : `Unit is missing for “${line.name}”. Choose the unit the source used.`,
      });
    }
  });
  return issues;
}

export function reviewIsReady(review: ComponentImportReviewState): boolean {
  const name = review.name.trim();
  if (!name || review.lines.length === 0) {
    return false;
  }
  if (isMissingQuantity(review.yieldQuantity) || review.yieldUnit == null) {
    return false;
  }
  if (countUnresolvedLines(review.lines) !== 0) {
    return false;
  }
  return reviewMeasurementIssues(review).length === 0;
}
