import { ConvexHttpClient } from "convex/browser";
import type {
  EventPrepDemand,
  EventPrepDishTask,
  EventPrepTask,
} from "../features/kitchen/EventPrepCoordinator";
import { api } from "../lib/api";
import type { CapsuleEventPrepStateLoader } from "./CapsuleEventPrepCoordinator";
import { CapsuleAgentAuthManager } from "./CapsuleAgentAuthManager";

type QueryClient = {
  query(reference: unknown, args: Record<string, never>): Promise<unknown>;
};

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

/**
 * Reads the same tenant-scoped state used by the Event menu before reconciling
 * an EventDish into generated prep tasks and ingredient demand.
 */
export class CapsuleLiveEventPrepStateLoader implements CapsuleEventPrepStateLoader {
  private readonly client: QueryClient;

  constructor(
    client?: QueryClient,
    auth: CapsuleAgentAuthManager = new CapsuleAgentAuthManager(),
  ) {
    if (client) {
      this.client = client;
      return;
    }
    const live = new ConvexHttpClient(auth.resolveConvexUrl());
    live.setAuth(auth.requireJwt());
    this.client = live as unknown as QueryClient;
  }

  async load(input: { eventId: string; dishId: string }) {
    const [templateRows, taskRows, demandRows] = await Promise.all([
      this.client.query(api.queries.listDishTask, {}),
      this.client.query(api.queries.listPrepTask, {}),
      this.client.query(api.queries.listIngredientDemand, {}),
    ]);
    const templates = rows(templateRows)
      .filter((row) => row.dishId === input.dishId)
      .map(
        (row) =>
          ({
            id: String(row._id),
            dishId: String(row.dishId),
            name: String(row.name),
            defaultQuantity: row.defaultQuantity as number | null | undefined,
            defaultUnit: row.defaultUnit as EventPrepDishTask["defaultUnit"],
            category: row.category as string | null | undefined,
            taskType: row.taskType as string | null | undefined,
            sortOrder: row.sortOrder as number | null | undefined,
            recipeId: row.recipeId as string | null | undefined,
            ingredientId: row.ingredientId as string | null | undefined,
            instructions: row.instructions as string | null | undefined,
            status: String(row.status),
          }) satisfies EventPrepDishTask,
      );
    const tasks = rows(taskRows)
      .filter((row) => row.eventId === input.eventId)
      .map(
        (row) =>
          ({
            id: String(row._id),
            eventDishId: String(row.eventDishId),
            eventId: String(row.eventId),
            dishId: row.dishId as string | null | undefined,
            dishTaskId: row.dishTaskId as string | null | undefined,
            name: String(row.name),
            quantity: Number(row.quantity),
            unit: row.unit as EventPrepTask["unit"],
            ingredientId: row.ingredientId as string | null | undefined,
            ingredientDemandId: row.ingredientDemandId as
              string | null | undefined,
            recipeId: row.recipeId as string | null | undefined,
            specialInstructions: row.specialInstructions as
              string | null | undefined,
            isGenerated: Boolean(row.isGenerated),
            status: String(row.status),
            version: row.version as number | undefined,
            deletedAt: row.deletedAt as number | null | undefined,
          }) satisfies EventPrepTask,
      );
    const demands = rows(demandRows)
      .filter((row) => row.eventId === input.eventId)
      .map(
        (row) =>
          ({
            id: String(row._id),
            eventId: String(row.eventId),
            ingredientId: String(row.ingredientId),
            requiredQuantity: Number(row.requiredQuantity),
            unit: row.unit as EventPrepDemand["unit"],
            status: String(row.status),
            version: Number(row.version),
          }) satisfies EventPrepDemand,
      );
    return { templates, tasks, demands };
  }
}
