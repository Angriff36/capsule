import {
  EventPrepCoordinator,
  type EventPrepDemand,
  type EventPrepDishTask,
  type EventPrepTask,
} from "../features/kitchen/EventPrepCoordinator";
import type { CapsuleCommandExecutor } from "./CapsuleCommandExecutor";

export interface CapsuleEventPrepStateLoader {
  load(input: { eventId: string; dishId: string }): Promise<{
    templates: readonly EventPrepDishTask[];
    tasks: readonly EventPrepTask[];
    demands: readonly EventPrepDemand[];
  }>;
}

export interface AddEventDishAndSyncInput {
  eventId: string;
  dishId: string;
  quantityServings: number;
  course?: string;
  serviceStyle?: string;
  specialInstructions?: string;
  idempotencyKey?: string;
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

function invocationKey(base: string | undefined, suffix: string) {
  return base ? `${base}:${suffix}` : undefined;
}

/**
 * Agent: add EventDish (Manifest owns component→demand→weekly draft), then sync PrepTasks.
 */
export class CapsuleEventPrepCoordinator {
  constructor(
    private readonly executor: CapsuleCommandExecutor,
    private readonly loader: CapsuleEventPrepStateLoader,
  ) {}

  async addDishAndSync(input: AddEventDishAndSyncInput) {
    const eventDishId = asDocId(
      await this.executor.execute({
        capabilityId: "EventDish.addToEvent",
        args: {
          eventId: input.eventId,
          dishId: input.dishId,
          quantityServings: input.quantityServings,
          course: input.course,
          serviceStyle: input.serviceStyle,
          specialInstructions: input.specialInstructions,
        },
        idempotencyKey: invocationKey(input.idempotencyKey, "event-dish"),
      }),
    );
    const state = await this.loader.load({
      eventId: input.eventId,
      dishId: input.dishId,
    });
    const coordinator = new EventPrepCoordinator({
      createTask: async ({ idempotencyKey, ...args }) => ({
        docId: asDocId(
          await this.executor.execute({
            capabilityId: "PrepTask.open",
            args,
            idempotencyKey,
          }),
        ),
      }),
      refreshGeneratedTask: (args) =>
        this.executor.execute({
          capabilityId: "PrepTask.refreshGenerated",
          args,
        }),
    });
    const result = await coordinator.sync({
      eventDish: {
        id: eventDishId,
        eventId: input.eventId,
        dishId: input.dishId,
        quantityServings: input.quantityServings,
        specialInstructions: input.specialInstructions,
      },
      ...state,
      skipDemand: true,
    });
    return { eventDishId, ...result };
  }
}
