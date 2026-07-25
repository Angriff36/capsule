// Import Pipeline — Defines import stages, transitions, validation rules, and error handling strategies.
// Coordinates with ImportRun entity for state management.

import { v } from "convex/values";

/**
 * Import pipeline stages in order of execution
 */
export const IMPORT_STAGES = [
  "started",
  "parsing",
  "validating",
  "reviewing",
  "committing",
  "completed",
  "failed",
  "reverted",
] as const;

export type ImportStage = (typeof IMPORT_STAGES)[number];

/**
 * Valid stage transitions based on ImportRun manifest constraints
 */
export const VALID_TRANSITIONS: Record<ImportStage, ImportStage[]> = {
  started: ["parsing", "failed"],
  parsing: ["validating", "failed"],
  validating: ["reviewing", "failed"],
  reviewing: ["committing", "failed"],
  committing: ["completed", "failed"],
  completed: ["reverted"],
  failed: [],
  reverted: [],
};

/**
 * Validation rule types for field-level validation
 */
export const VALIDATION_RULES = {
  fieldRequired: "fieldRequired",
  formatCheck: "formatCheck",
  rangeCheck: "rangeCheck",
  enumCheck: "enumCheck",
  lookupCheck: "lookupCheck",
  uniqueCheck: "uniqueCheck",
} as const;

/**
 * Error handling strategies per stage
 */
export const ERROR_STRATEGIES = {
  parsing: {
    strategy: "abort",
    reason: "Cannot validate unparseable data",
    canRetry: true,
  },
  validating: {
    strategy: "continue",
    reason: "Collect all validation errors for review",
    canRetry: true,
  },
  reviewing: {
    strategy: "manual",
    reason: "Requires user intervention",
    canRetry: false,
  },
  committing: {
    strategy: "rollback",
    reason: "Data integrity - rollback all changes on failure",
    canRetry: false,
  },
} as const;

/**
 * Stage-specific validation rules
 */
export interface StageValidation {
  stage: ImportStage;
  requiredPreconditions: string[];
  validationRules: Array<{
    field: string;
    rule: (typeof VALIDATION_RULES)[keyof typeof VALIDATION_RULES];
    severity: "error" | "warning";
    message?: string;
  }>;
}

export const STAGE_VALIDATIONS: Record<
  Exclude<ImportStage, "failed" | "reverted">,
  StageValidation
> = {
  started: {
    stage: "started",
    requiredPreconditions: ["actorId present", "datasetType valid"],
    validationRules: [
      {
        field: "sourceSystem",
        rule: VALIDATION_RULES.enumCheck,
        severity: "error",
        message: "Source system must be tpp_legacy, csv_export, or api_sync",
      },
      {
        field: "datasetType",
        rule: VALIDATION_RULES.enumCheck,
        severity: "error",
        message:
          "Dataset type must be events, contacts, leads, menus, venues, or payments",
      },
    ],
  },
  parsing: {
    stage: "parsing",
    requiredPreconditions: ["status is started", "startTime set"],
    validationRules: [
      {
        field: "recordCounts",
        rule: VALIDATION_RULES.fieldRequired,
        severity: "error",
        message: "Record counts must be provided after parsing",
      },
    ],
  },
  validating: {
    stage: "validating",
    requiredPreconditions: ["status is parsing", "parsedAt set"],
    validationRules: [
      {
        field: "recordCounts",
        rule: VALIDATION_RULES.fieldRequired,
        severity: "error",
        message: "Record counts must be present for validation",
      },
    ],
  },
  reviewing: {
    stage: "reviewing",
    requiredPreconditions: ["status is validating", "validatedAt set"],
    validationRules: [
      {
        field: "recordCounts",
        rule: VALIDATION_RULES.fieldRequired,
        severity: "warning",
        message: "Review final record counts before commit",
      },
    ],
  },
  committing: {
    stage: "committing",
    requiredPreconditions: ["status is reviewing", "reviewApprovedAt set"],
    validationRules: [
      {
        field: "recordCounts",
        rule: VALIDATION_RULES.fieldRequired,
        severity: "error",
        message: "Final record counts required for commit",
      },
    ],
  },
  completed: {
    stage: "completed",
    requiredPreconditions: ["status is committing", "commitStartedAt set"],
    validationRules: [
      {
        field: "completionTime",
        rule: VALIDATION_RULES.fieldRequired,
        severity: "error",
        message: "Completion time must be set",
      },
    ],
  },
};

/**
 * Check if a stage transition is valid
 */
export function isValidTransition(from: ImportStage, to: ImportStage): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Get required preconditions for a stage
 */
export function getRequiredPreconditions(stage: ImportStage): string[] {
  // failed and reverted stages have no preconditions
  if (stage === "failed" || stage === "reverted") {
    return [];
  }
  return STAGE_VALIDATIONS[stage]?.requiredPreconditions ?? [];
}

/**
 * Get error handling strategy for a stage
 */
export function getErrorStrategy(stage: ImportStage) {
  // Terminal stages have default strategies
  if (stage === "failed" || stage === "reverted" || stage === "completed") {
    return {
      strategy: "halt",
      reason:
        stage === "failed"
          ? "Import failed"
          : stage === "reverted"
            ? "Import was reverted"
            : "Import completed",
      canRetry: false,
    };
  }
  // started stage has no specific error strategy
  if (stage === "started") {
    return {
      strategy: "abort",
      reason: "Import not yet started",
      canRetry: true,
    };
  }
  return ERROR_STRATEGIES[stage];
}

/**
 * Validation result for a record
 */
export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    message: string;
    severity: "error" | "warning";
  }>;
}

/**
 * Validate record counts object
 */
export function validateRecordCounts(counts: unknown): ValidationResult {
  const errors: Array<{
    field: string;
    message: string;
    severity: "error" | "warning";
  }> = [];

  if (typeof counts !== "string") {
    return {
      valid: false,
      errors: [
        {
          field: "recordCounts",
          message: "Record counts must be a JSON string",
          severity: "error",
        },
      ],
    };
  }

  try {
    const parsed = JSON.parse(counts);
    if (typeof parsed !== "object" || parsed === null) {
      errors.push({
        field: "recordCounts",
        message: "Record counts must be a valid object",
        severity: "error",
      });
    }
  } catch {
    errors.push({
      field: "recordCounts",
      message: "Invalid JSON format",
      severity: "error",
    });
  }

  return {
    valid: errors.filter((e) => e.severity === "error").length === 0,
    errors,
  };
}

/**
 * Schema definitions for Convex validation
 */
export const ImportProgressArgs = {
  importRunId: v.id("importRuns"),
  stage: v.string(),
  actorId: v.optional(v.string()),
} as const;

export const RecordCountsArgs = {
  importRunId: v.id("importRuns"),
  recordCounts: v.string(),
  actorId: v.optional(v.string()),
} as const;

export const FailureDetailsArgs = {
  importRunId: v.id("importRuns"),
  failureDetails: v.string(),
  actorId: v.optional(v.string()),
} as const;
