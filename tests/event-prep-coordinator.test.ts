import { describe, expect, it, vi } from "vitest";
import {
  EventPrepCoordinator,
  type EventPrepDishTask,
  type EventPrepDemand,
  type EventPrepTask,
} from "../src/features/kitchen/EventPrepCoordinator";

const template = (
  overrides: Partial<EventPrepDishTask> = {},
): EventPrepDishTask => ({
  id: "dish-task-romaine",
  dishId: "dish-salad",
  name: "Chop romaine",
  defaultQuantity: 1,
  defaultUnit: "portion",
  category: "finish_at_event",
  taskType: "manual",
  sortOrder: 0,
  status: "active",
  ...overrides,
});

const task = (overrides: Partial<EventPrepTask> = {}): EventPrepTask => ({
  id: "prep-1",
  eventDishId: "event-dish-1",
  eventId: "event-1",
  dishId: "dish-salad",
  dishTaskId: "dish-task-romaine",
  name: "Chop romaine",
  quantity: 40,
  unit: "portion",
  ingredientId: "ingredient-romaine",
  isGenerated: true,
  status: "pending",
  ...overrides,
});

const demand = (overrides: Partial<EventPrepDemand> = {}): EventPrepDemand => ({
  id: "demand-romaine",
  eventId: "event-1",
  ingredientId: "ingredient-romaine",
  requiredQuantity: 40,
  unit: "portion",
  status: "calculated",
  version: 1,
  ...overrides,
});

describe("EventPrepCoordinator", () => {
  it("creates one demand and generated prep task for each active dish template", async () => {
    const createDemand = vi.fn().mockResolvedValue({ docId: "demand-romaine" });
    const confirmDemand = vi.fn().mockResolvedValue(undefined);
    const createTask = vi.fn().mockResolvedValue({ docId: "prep-1" });
    const coordinator = new EventPrepCoordinator({
      createDemand,
      confirmDemand,
      createTask,
    });

    await coordinator.sync({
      eventDish: {
        id: "event-dish-1",
        eventId: "event-1",
        dishId: "dish-salad",
        quantityServings: 40,
        specialInstructions: "Gluten-free guests: no croutons",
      },
      templates: [
        template({ ingredientId: "ingredient-romaine" }),
        template({
          id: "dish-task-croutons",
          name: "Portion croutons",
          defaultQuantity: 0.5,
          defaultUnit: "kilogram",
          ingredientId: "ingredient-croutons",
          sortOrder: 1,
        }),
      ],
      tasks: [],
      demands: [],
    });

    expect(createDemand).toHaveBeenCalledTimes(2);
    expect(confirmDemand).toHaveBeenCalledTimes(2);
    expect(createDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-1",
        ingredientId: "ingredient-croutons",
        requiredQuantity: 20,
        unit: "kilogram",
        dishId: "dish-salad",
        servings: 40,
      }),
    );
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({
        eventDishId: "event-dish-1",
        eventId: "event-1",
        dishTaskId: "dish-task-romaine",
        quantity: 40,
        ingredientDemandId: "demand-romaine",
        specialInstructions: "Gluten-free guests: no croutons",
        isGenerated: true,
      }),
    );
  });

  it("resizes generated work and demand but leaves manually edited work alone", async () => {
    const recalculateDemand = vi.fn().mockResolvedValue(undefined);
    const refreshGeneratedTask = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EventPrepCoordinator({
      recalculateDemand,
      refreshGeneratedTask,
    });

    await coordinator.sync({
      eventDish: {
        id: "event-dish-1",
        eventId: "event-1",
        dishId: "dish-salad",
        quantityServings: 60,
      },
      templates: [template({ ingredientId: "ingredient-romaine" })],
      tasks: [
        task(),
        task({
          id: "prep-manual",
          name: "Chop romaine extra fine",
          dishTaskId: undefined,
          ingredientId: undefined,
          isGenerated: false,
        }),
      ],
      demands: [demand()],
    });

    expect(recalculateDemand).toHaveBeenCalledWith({
      docId: "demand-romaine",
      version: 1,
      newQuantity: 60,
      reason: "Event dish serving quantity changed",
    });
    expect(refreshGeneratedTask).toHaveBeenCalledWith({
      docId: "prep-1",
      version: undefined,
      quantity: 60,
      specialInstructions: undefined,
    });
    expect(refreshGeneratedTask).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate templates already materialized for the event dish", async () => {
    const createTask = vi.fn();
    const coordinator = new EventPrepCoordinator({ createTask });

    await coordinator.sync({
      eventDish: {
        id: "event-dish-1",
        eventId: "event-1",
        dishId: "dish-salad",
        quantityServings: 40,
      },
      templates: [template()],
      tasks: [task()],
      demands: [],
    });

    expect(createTask).not.toHaveBeenCalled();
  });

  it("reconciles event demand after a dish is removed", async () => {
    const recalculateDemand = vi.fn().mockResolvedValue(undefined);
    const supersedeDemand = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EventPrepCoordinator({
      recalculateDemand,
      supersedeDemand,
    });

    await coordinator.reconcileEventDemands({
      eventId: "event-1",
      tasks: [
        task({
          id: "prep-remaining",
          ingredientId: "ingredient-romaine",
          quantity: 40,
        }),
      ],
      demands: [
        demand(),
        demand({
          id: "demand-removed",
          ingredientId: "ingredient-croutons",
          requiredQuantity: 20,
        }),
      ],
    });

    expect(recalculateDemand).not.toHaveBeenCalled();
    expect(supersedeDemand).toHaveBeenCalledWith({
      docId: "demand-removed",
      version: 1,
      reason: "All prep tasks for this ingredient were removed from the event",
    });
  });
});
