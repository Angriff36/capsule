/**
 * Durable persistence adapter for the component import workbench.
 *
 * Why: corrections made during review must survive close/reopen, and a save
 * must be one governed transaction — a client loop of partially successful
 * row writes would leave a review half-corrected with no revision story.
 * Every request built here targets the authored transactional mutations in
 * `convex/lib/culinaryOperations.ts`, so the repository never writes rows
 * itself and never concatenates CSV inputs into one ambiguous blob.
 */
import type {
  ComponentImportReviewState,
  ComponentImportSourceKind,
  IngredientMatchStatus,
  ReviewIngredientLine,
} from "./ComponentImportTypes";
import { reviewIsReady } from "./ComponentImportTypes";
import type { UnitOfMeasure } from "./UnitOfMeasureMapper";
import { SourceFingerprint } from "./SourceFingerprint";

export interface ComponentImportSourceInput {
  kind: ComponentImportSourceKind;
  filename?: string;
  /** Primary source text (the pasted recipe, or the CSV sheet text). */
  rawText: string;
  /** Exact CSV pair members; stored separately so each stays recoverable. */
  csvSheetText?: string;
  csvLinesText?: string;
}

export interface CreateComponentImportReviewRequest {
  approveWhenReady?: boolean;
  source: {
    kind: ComponentImportSourceKind;
    filename?: string;
    rawText: string;
    csvSheetText?: string;
    csvLinesText?: string;
    byteCount: number;
    fingerprint: string;
  };
  parsed: {
    name: string;
    lineCount: number;
    description?: string;
    category?: string;
    cuisine?: string;
    instructions?: string;
    yieldQuantity?: number;
    yieldUnit?: UnitOfMeasure;
    batchMultiplier?: number;
  };
  lines: {
    sourceOrder: number;
    sourceLine: string;
    parsedQuantity?: number;
    parsedUnit?: UnitOfMeasure;
    parsedIngredientName?: string;
    preparationNote?: string;
    /** Workbench match confidence to store with the staged line. */
    match?: {
      matchStatus: IngredientMatchStatus;
      matchedIngredientId?: string;
      possibleMatchIngredientIds?: string[];
    };
  }[];
}

/** Durable match form of a review line: only fields storage keeps. */
function durableMatch(line: ReviewIngredientLine) {
  return {
    matchStatus: line.matchStatus,
    matchedIngredientId:
      line.matchStatus === "exact" || line.matchStatus === "confirmed_existing"
        ? line.matchedIngredientId
        : undefined,
    possibleMatchIngredientIds:
      line.matchStatus === "possible" ? line.possibleMatchIds : undefined,
  };
}

/** Builds the one-transaction create request from a parsed review state. */
export function buildCreateReviewRequest(
  review: ComponentImportReviewState,
  source: ComponentImportSourceInput,
): CreateComponentImportReviewRequest {
  return {
    source: {
      kind: source.kind,
      filename: source.filename,
      rawText: source.rawText,
      csvSheetText: source.csvSheetText,
      csvLinesText: source.csvLinesText,
      byteCount: source.rawText.length,
      // Display/dedup candidate only — identity is the import id + revision.
      fingerprint: new SourceFingerprint().digest(source.rawText),
    },
    parsed: {
      name: review.name.trim(),
      lineCount: review.lines.length,
      description: review.description?.trim() || undefined,
      category: review.category?.trim() || undefined,
      cuisine: review.cuisine?.trim() || undefined,
      instructions: review.instructions?.trim() || undefined,
      yieldQuantity: review.yieldQuantity ?? undefined,
      yieldUnit: review.yieldUnit ?? undefined,
      batchMultiplier: review.batchMultiplier || undefined,
    },
    lines: review.lines.map((line, index) => ({
      sourceOrder: index,
      sourceLine: line.raw,
      parsedQuantity: line.quantity ?? undefined,
      parsedUnit: line.unit ?? undefined,
      parsedIngredientName: line.name?.trim() || undefined,
      preparationNote: line.prepNotes?.trim() || undefined,
      match: line.matchStatus === "unresolved" ? undefined : durableMatch(line),
    })),
  };
}

/** Stored ComponentImport row fields the review reload reads. */
export interface StoredComponentImportRow {
  _id: string;
  sourceKind: ComponentImportSourceKind;
  sourceFilename?: string | null;
  rawSourceText?: string | null;
  csvSheetText?: string | null;
  csvLinesText?: string | null;
  parsedName?: string | null;
  parsedDescription?: string | null;
  parsedCategory?: string | null;
  parsedCuisine?: string | null;
  parsedInstructions?: string | null;
  parsedYieldQuantity?: number | null;
  parsedYieldUnit?: UnitOfMeasure | null;
  parsedBatchMultiplier?: number | null;
  reviewRevision: number;
  status: string;
  resultingComponentId?: string | null;
}

/** Stored ComponentImportLine row fields the review reload reads. */
export interface StoredComponentImportLineRow {
  _id: string;
  importId: string;
  sourceOrder: number;
  sourceLine: string;
  parsedQuantity?: number | null;
  parsedUnit?: UnitOfMeasure | null;
  parsedIngredientName?: string | null;
  preparationNote?: string | null;
  matchStatus: string;
  matchedIngredientId?: string | null;
}

const MATCH_STATUSES: ReadonlySet<string> = new Set([
  "unresolved",
  "exact",
  "possible",
  "new",
  "confirmed_existing",
  "confirmed_new",
]);

/**
 * Rebuilds the editable review state from stored rows. Unknown measurements
 * stay null and raw line text is carried verbatim — corrections never
 * replaced the source, so a reload shows exactly what was saved.
 */
export function mapStoredReview(
  row: StoredComponentImportRow,
  lines: StoredComponentImportLineRow[],
): ComponentImportReviewState {
  const ordered = [...lines].sort((a, b) => a.sourceOrder - b.sourceOrder);
  return {
    importId: row._id,
    reviewRevision: row.reviewRevision,
    sourceKind: row.sourceKind,
    sourceFilename: row.sourceFilename ?? undefined,
    rawSourceText: row.rawSourceText ?? undefined,
    csvSheetText: row.csvSheetText ?? undefined,
    csvLinesText: row.csvLinesText ?? undefined,
    name: row.parsedName ?? "",
    description: row.parsedDescription ?? undefined,
    category: row.parsedCategory ?? undefined,
    cuisine: row.parsedCuisine ?? undefined,
    yieldQuantity: row.parsedYieldQuantity ?? null,
    yieldUnit: row.parsedYieldUnit ?? null,
    batchMultiplier: row.parsedBatchMultiplier ?? 1,
    instructions: row.parsedInstructions ?? undefined,
    lines: ordered.map((line) => ({
      raw: line.sourceLine,
      name: line.parsedIngredientName ?? "",
      quantity: line.parsedQuantity ?? null,
      unit: line.parsedUnit ?? null,
      // The raw unit token is display-only; the verbatim source line keeps it.
      unitRaw: "",
      prepNotes: line.preparationNote ?? undefined,
      matchStatus: (MATCH_STATUSES.has(line.matchStatus)
        ? line.matchStatus
        : "unresolved") as ReviewIngredientLine["matchStatus"],
      matchedIngredientId: line.matchedIngredientId ?? undefined,
      possibleMatchIds: [],
      possibleMatchNames: [],
      createNew: line.matchStatus === "confirmed_new",
      importLineId: line._id,
    })),
    warnings: [],
    errors: [],
  };
}

export interface SaveComponentImportReviewRequest {
  approveWhenReady?: boolean;
  importId: string;
  expectedReviewRevision: number;
  header: {
    name: string;
    description?: string;
    category?: string;
    cuisine?: string;
    instructions?: string;
    yieldQuantity?: number;
    yieldUnit?: UnitOfMeasure;
    batchMultiplier?: number;
  };
  lines: {
    lineId: string;
    parsedQuantity?: number;
    parsedUnit?: UnitOfMeasure;
    preparationNote?: string;
    parsedIngredientName?: string;
    match?: {
      matchStatus:
        | "unresolved"
        | "exact"
        | "possible"
        | "new"
        | "confirmed_existing"
        | "confirmed_new";
      matchedIngredientId?: string;
      possibleMatchIngredientIds?: string[];
    };
  }[];
  /** Baseline lines removed from the edited review, soft-discarded on save. */
  discardedLines?: { lineId: string; reason: string }[];
}

/**
 * Builds the one-transaction save request by diffing the edited review
 * against the loaded baseline. Only changed lines are sent, and omitted
 * fields keep their stored values — an unknown measurement stays unknown.
 * Match decisions, name corrections and removed lines ride the same
 * transaction so a saved review reopens exactly as it was left.
 */
export function buildSaveReviewRequest(
  baseline: ComponentImportReviewState,
  review: ComponentImportReviewState,
  expectedRevision: number,
): SaveComponentImportReviewRequest {
  const lines: SaveComponentImportReviewRequest["lines"] = [];
  for (const line of review.lines) {
    if (!line.importLineId) continue;
    const before = baseline.lines.find(
      (item) => item.importLineId === line.importLineId,
    );
    if (!before) continue;
    const quantityChanged = before.quantity !== line.quantity;
    const unitChanged = before.unit !== line.unit;
    const prepChanged =
      (before.prepNotes ?? undefined) !== (line.prepNotes ?? undefined);
    const nameChanged = before.name !== line.name;
    const matchChanged =
      JSON.stringify(durableMatch(before)) !==
      JSON.stringify(durableMatch(line));
    if (
      !quantityChanged &&
      !unitChanged &&
      !prepChanged &&
      !nameChanged &&
      !matchChanged
    )
      continue;
    lines.push({
      lineId: line.importLineId,
      ...(quantityChanged
        ? { parsedQuantity: line.quantity ?? undefined }
        : {}),
      ...(unitChanged ? { parsedUnit: line.unit ?? undefined } : {}),
      ...(prepChanged
        ? { preparationNote: line.prepNotes?.trim() || undefined }
        : {}),
      ...(nameChanged
        ? { parsedIngredientName: line.name.trim() || undefined }
        : {}),
      ...(matchChanged ? { match: durableMatch(line) } : {}),
    });
  }
  const keptLineIds = new Set(
    review.lines.map((line) => line.importLineId).filter(Boolean),
  );
  const discardedLines = baseline.lines
    .filter((line) => line.importLineId && !keptLineIds.has(line.importLineId))
    .map((line) => ({
      lineId: line.importLineId as string,
      reason: "Removed during review",
    }));
  return {
    importId: review.importId ?? baseline.importId ?? "",
    expectedReviewRevision: expectedRevision,
    header: {
      name: review.name.trim(),
      description: review.description?.trim() || undefined,
      category: review.category?.trim() || undefined,
      cuisine: review.cuisine?.trim() || undefined,
      instructions: review.instructions?.trim() || undefined,
      yieldQuantity: review.yieldQuantity ?? undefined,
      yieldUnit: review.yieldUnit ?? undefined,
      batchMultiplier: review.batchMultiplier || undefined,
    },
    lines,
    ...(discardedLines.length ? { discardedLines } : {}),
  };
}

export interface ComponentImportRepositoryPorts {
  createReview: (
    request: CreateComponentImportReviewRequest,
  ) => Promise<{ importId: string; reviewRevision: number; lineIds: string[] }>;
  saveReview: (
    request: SaveComponentImportReviewRequest,
  ) => Promise<{ reviewRevision: number }>;
  getImport: (importId: string) => Promise<StoredComponentImportRow | null>;
  listLinesByImportId: (
    importId: string,
  ) => Promise<StoredComponentImportLineRow[]>;
}

/** Persists and reloads review state through governed transactions only. */
export class ComponentImportRepository {
  private baseline: ComponentImportReviewState | null = null;

  constructor(private readonly ports: ComponentImportRepositoryPorts) {}

  async create(
    review: ComponentImportReviewState,
    source: ComponentImportSourceInput,
  ): Promise<{ importId: string; reviewRevision: number; lineIds: string[] }> {
    const result = await this.ports.createReview({
      ...buildCreateReviewRequest(review, source),
      approveWhenReady: reviewIsReady(review),
    });
    this.baseline = {
      ...review,
      importId: result.importId,
      reviewRevision: result.reviewRevision,
      lines: review.lines.map((line, index) => ({
        ...line,
        importLineId: result.lineIds[index],
      })),
    };
    return result;
  }

  async load(importId: string): Promise<ComponentImportReviewState> {
    const row = await this.ports.getImport(importId);
    if (!row) throw new Error("Component import not found");
    const lines = await this.ports.listLinesByImportId(importId);
    const state = mapStoredReview(row, lines);
    this.baseline = state;
    return state;
  }

  /**
   * Adopts an externally loaded stored state (the workbench loads reactively
   * through generated queries) as the save baseline, the same way `load`
   * would. Pure bookkeeping — no writes.
   */
  adopt(state: ComponentImportReviewState): void {
    this.baseline = state;
  }

  async save(
    review: ComponentImportReviewState,
    expectedRevision: number,
  ): Promise<{ reviewRevision: number }> {
    if (!this.baseline)
      throw new Error("Load or create the review before saving");
    const request = buildSaveReviewRequest(
      this.baseline,
      review,
      expectedRevision,
    );
    const result = await this.ports.saveReview({
      ...request,
      approveWhenReady: reviewIsReady(review),
    });
    this.baseline = {
      ...review,
      reviewRevision: result.reviewRevision,
    };
    return result;
  }
}
