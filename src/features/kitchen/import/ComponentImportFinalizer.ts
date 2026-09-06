import type { UnitOfMeasure } from "./UnitOfMeasureMapper";
import {
  countUnresolvedLines,
  isLineResolved,
  type ComponentImportReviewState,
} from "./ComponentImportTypes";

export interface CreateIngredientInput {
  name: string;
  unit: UnitOfMeasure;
  costPerUnit: number;
  allergens?: string[];
  category?: string;
}

export interface CreateComponentInput {
  name: string;
  yieldQuantity: number;
  yieldUnit: UnitOfMeasure;
  batchMultiplier?: number;
  category?: string;
  cuisine?: string;
  description?: string;
  instructions?: string;
}

export interface CreateComponentIngredientInput {
  componentId: string;
  ingredientId: string;
  quantity: number;
  unit: UnitOfMeasure;
  sortOrder?: number;
  prepNotes?: string;
}

export interface ComponentImportCommandPorts {
  importComponent?: (input: {
    operationKey: string;
    projection: Record<string, unknown>;
  }) => Promise<ComponentImportFinalizeResult>;
  createIngredient: (
    input: CreateIngredientInput,
  ) => Promise<{ docId: string }>;
  createComponent: (input: CreateComponentInput) => Promise<{ docId: string }>;
  createComponentIngredient: (
    input: CreateComponentIngredientInput,
  ) => Promise<{ docId: string }>;
}

export interface ComponentImportFinalizeResult {
  componentId: string;
  createdIngredientIds: string[];
  lineIds: string[];
  recovered?: boolean;
}

/**
 * Finalizes a reviewed import draft through generated createVia commands only.
 * Measured fields are nullable through review; finalize narrows them to the
 * required-number projection only after validation, so no guessed default
 * ever reaches a write.
 */
export class ComponentImportFinalizer {
  constructor(private readonly ports: ComponentImportCommandPorts) {}

  async finalize(
    review: ComponentImportReviewState,
    operationKey?: string,
  ): Promise<ComponentImportFinalizeResult> {
    const name = review.name.trim();
    if (!name) throw new Error("Component name is required");
    const yieldQuantity = requireMeasuredQuantity(
      review.yieldQuantity,
      "Component yield quantity must be positive",
    );
    const yieldUnit = requireMeasuredUnit(
      review.yieldUnit,
      "Component yield unit is required",
    );
    if (review.lines.length === 0) {
      throw new Error("Add at least one ingredient line before saving");
    }
    const unresolved = countUnresolvedLines(review.lines);
    if (unresolved > 0) {
      throw new Error(
        `${unresolved} ingredient line${unresolved === 1 ? "" : "s"} still need review`,
      );
    }
    const measuredLines = review.lines.map((line) => ({
      line,
      quantity: requireMeasuredQuantity(
        line.quantity,
        `Quantity must be positive for ${line.name}`,
      ),
      unit: requireMeasuredUnit(line.unit, `Unit is required for ${line.name}`),
    }));
    for (const { line } of measuredLines) {
      if (!isLineResolved(line)) {
        throw new Error(`${line.name} is not resolved`);
      }
    }

    if (this.ports.importComponent && operationKey) {
      return this.ports.importComponent({
        operationKey,
        projection: {
          name,
          yieldQuantity,
          yieldUnit,
          batchMultiplier: review.batchMultiplier,
          category: review.category?.trim() || undefined,
          cuisine: review.cuisine?.trim() || undefined,
          description: review.description?.trim() || undefined,
          instructions: review.instructions?.trim() || undefined,
          lines: measuredLines.map(({ line, quantity, unit }, index) => ({
            name: line.name.trim(),
            ingredientId:
              line.createNew || line.matchStatus === "confirmed_new"
                ? undefined
                : line.matchedIngredientId,
            createNew:
              line.createNew || line.matchStatus === "confirmed_new"
                ? true
                : undefined,
            quantity,
            unit,
            sortOrder: index + 1,
            prepNotes: line.prepNotes?.trim() || undefined,
          })),
        },
      });
    }

    const createdIngredientIds: string[] = [];
    const ingredientIds: string[] = [];

    for (const { line, unit } of measuredLines) {
      if (line.createNew || line.matchStatus === "confirmed_new") {
        const created = await this.ports.createIngredient({
          name: line.name.trim(),
          unit,
          costPerUnit: 0,
          allergens: [],
        });
        createdIngredientIds.push(created.docId);
        ingredientIds.push(created.docId);
      } else if (line.matchedIngredientId) {
        ingredientIds.push(line.matchedIngredientId);
      } else {
        throw new Error(`${line.name} is missing a matched ingredient`);
      }
    }

    const component = await this.ports.createComponent({
      name,
      yieldQuantity,
      yieldUnit,
      batchMultiplier: review.batchMultiplier,
      category: review.category?.trim() || undefined,
      cuisine: review.cuisine?.trim() || undefined,
      description: review.description?.trim() || undefined,
      instructions: review.instructions?.trim() || undefined,
    });

    const lineIds: string[] = [];
    for (let index = 0; index < measuredLines.length; index += 1) {
      const { line, quantity, unit } = measuredLines[index];
      const created = await this.ports.createComponentIngredient({
        componentId: component.docId,
        ingredientId: ingredientIds[index],
        quantity,
        unit,
        sortOrder: index + 1,
        prepNotes: line.prepNotes?.trim() || undefined,
      });
      lineIds.push(created.docId);
    }

    return {
      componentId: component.docId,
      createdIngredientIds,
      lineIds,
    };
  }
}

function requireMeasuredQuantity(
  value: number | null,
  message: string,
): number {
  // Same rule as isMissingQuantity, inlined so the narrowing holds here.
  if (value == null || !Number.isFinite(value) || value <= 0) {
    throw new Error(message);
  }
  return value;
}

function requireMeasuredUnit(
  value: UnitOfMeasure | null,
  message: string,
): UnitOfMeasure {
  if (value == null) throw new Error(message);
  return value;
}
