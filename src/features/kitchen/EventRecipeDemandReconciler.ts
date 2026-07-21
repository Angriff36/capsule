import type {
  EventPrepDemand,
  EventPrepDish,
  EventPrepUnit,
} from "./EventPrepCoordinator";

export type EventRecipeLink = {
  dishId: string;
  recipeId: string;
  deletedAt?: number | null;
  attachedAt?: number | null;
};

export type EventRecipe = {
  id: string;
  yieldQuantity: number;
  batchMultiplier: number;
  deletedAt?: number | null;
};

export type EventRecipeIngredientLine = {
  recipeId: string;
  ingredientId: string;
  quantity: number;
  unit: EventPrepUnit;
  deletedAt?: number | null;
  addedAt?: number | null;
};

type DemandCreateInput = {
  eventId: string;
  ingredientId: string;
  requiredQuantity: number;
  unit: EventPrepUnit;
  servings?: number;
  dishId?: string;
  sourceRecipeLineQuantity?: number;
  sourceBatchMultiplier?: number;
  sourceYieldQuantity?: number;
  idempotencyKey?: string;
};

type Ports = {
  createDemand: (input: DemandCreateInput) => Promise<{ docId: string }>;
  recalculateDemand: (input: {
    docId: string;
    version: number;
    newQuantity: number;
    reason: string;
  }) => Promise<unknown>;
  supersedeDemand: (input: {
    docId: string;
    version: number;
    reason: string;
  }) => Promise<unknown>;
};

type Aggregate = {
  eventId: string;
  ingredientId: string;
  unit: EventPrepUnit;
  requiredQuantity: number;
  servings: number;
  dishId?: string;
  sourceRecipeLineQuantity?: number;
  sourceBatchMultiplier?: number;
  sourceYieldQuantity?: number;
  lineCount: number;
};

/**
 * Reconciles IngredientDemand from EventDish × DishRecipe × RecipeIngredient.
 * Aggregate key: eventId + ingredientId + unit.
 */
export class EventRecipeDemandReconciler {
  constructor(private readonly ports: Ports) {}

  async reconcile(input: {
    eventId: string;
    eventDishes: readonly EventPrepDish[];
    dishRecipes: readonly EventRecipeLink[];
    recipes: readonly EventRecipe[];
    recipeIngredients: readonly EventRecipeIngredientLine[];
    demands: readonly EventPrepDemand[];
  }) {
    const groups = this.aggregate(input);
    let created = 0;
    let recalculated = 0;
    let superseded = 0;

    for (const group of groups.values()) {
      const existing = input.demands.find(
        (demand) =>
          demand.eventId === group.eventId &&
          demand.ingredientId === group.ingredientId &&
          demand.unit === group.unit &&
          demand.status !== "superseded",
      );
      if (!existing) {
        await this.ports.createDemand({
          eventId: group.eventId,
          ingredientId: group.ingredientId,
          requiredQuantity: group.requiredQuantity,
          unit: group.unit,
          servings: group.servings,
          dishId: group.dishId,
          sourceRecipeLineQuantity:
            group.lineCount === 1 ? group.sourceRecipeLineQuantity : undefined,
          sourceBatchMultiplier:
            group.lineCount === 1 ? group.sourceBatchMultiplier : undefined,
          sourceYieldQuantity:
            group.lineCount === 1 ? group.sourceYieldQuantity : undefined,
          idempotencyKey: `event-recipe-demand:${group.eventId}:${group.ingredientId}:${group.unit}`,
        });
        created += 1;
        continue;
      }
      if (existing.requiredQuantity !== group.requiredQuantity) {
        await this.ports.recalculateDemand({
          docId: existing.id,
          version: existing.version,
          newQuantity: group.requiredQuantity,
          reason: "Event menu recipe requirements changed",
        });
        recalculated += 1;
      }
    }

    for (const demand of input.demands) {
      if (demand.eventId !== input.eventId || demand.status === "superseded") {
        continue;
      }
      const key = this.key(demand.eventId, demand.ingredientId, demand.unit);
      if (groups.has(key)) continue;
      await this.ports.supersedeDemand({
        docId: demand.id,
        version: demand.version,
        reason: "Ingredient no longer required by the event menu",
      });
      superseded += 1;
    }

    return {
      demandCount: groups.size,
      created,
      recalculated,
      superseded,
    };
  }

  private aggregate(input: {
    eventId: string;
    eventDishes: readonly EventPrepDish[];
    dishRecipes: readonly EventRecipeLink[];
    recipes: readonly EventRecipe[];
    recipeIngredients: readonly EventRecipeIngredientLine[];
  }) {
    const recipesById = new Map(
      input.recipes
        .filter((recipe) => recipe.deletedAt == null)
        .map((recipe) => [recipe.id, recipe] as const),
    );
    const groups = new Map<string, Aggregate>();

    for (const eventDish of input.eventDishes) {
      if (
        eventDish.eventId !== input.eventId ||
        eventDish.quantityServings <= 0
      ) {
        continue;
      }
      const recipeIds = input.dishRecipes
        .filter(
          (link) =>
            link.dishId === eventDish.dishId &&
            link.deletedAt == null &&
            link.attachedAt != null,
        )
        .map((link) => link.recipeId);

      for (const recipeId of recipeIds) {
        const recipe = recipesById.get(recipeId);
        if (!recipe || recipe.yieldQuantity <= 0) continue;
        for (const line of input.recipeIngredients) {
          if (
            line.recipeId !== recipeId ||
            line.deletedAt != null ||
            line.addedAt == null ||
            line.quantity <= 0
          ) {
            continue;
          }
          const requiredQuantity =
            (line.quantity *
              recipe.batchMultiplier *
              eventDish.quantityServings) /
            recipe.yieldQuantity;
          if (requiredQuantity <= 0) continue;
          this.addContribution(groups, {
            eventId: input.eventId,
            ingredientId: line.ingredientId,
            unit: line.unit,
            requiredQuantity,
            servings: eventDish.quantityServings,
            dishId: eventDish.dishId,
            sourceRecipeLineQuantity: line.quantity,
            sourceBatchMultiplier: recipe.batchMultiplier,
            sourceYieldQuantity: recipe.yieldQuantity,
            lineCount: 1,
          });
        }
      }
    }

    return groups;
  }

  private addContribution(groups: Map<string, Aggregate>, next: Aggregate) {
    const key = this.key(next.eventId, next.ingredientId, next.unit);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...next });
      return;
    }
    existing.requiredQuantity += next.requiredQuantity;
    existing.servings += next.servings;
    existing.lineCount += next.lineCount;
  }

  private key(eventId: string, ingredientId: string, unit: EventPrepUnit) {
    return `${eventId}:${ingredientId}:${unit}`;
  }
}
