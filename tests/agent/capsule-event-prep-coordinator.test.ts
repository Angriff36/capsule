import { describe, expect, it, vi } from "vitest";
import {
  CapsuleEventPrepCoordinator,
  type CapsuleEventPrepStateLoader,
} from "../../src/agent/CapsuleEventPrepCoordinator";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import { CapsuleCommandCatalogProvider } from "../../src/agent/CapsuleCommandCatalogProvider";
import { CapsuleLiveEventPrepStateLoader } from "../../src/agent/CapsuleLiveEventPrepStateLoader";
import { CapsuleMcpToolRegistrar } from "../../src/agent/mcp/CapsuleMcpToolRegistrar";

describe("CapsuleEventPrepCoordinator", () => {
  it("registers the combined event dish and prep synchronization tool", () => {
    const tool = vi.fn();
    new CapsuleMcpToolRegistrar(new CapsuleCommandCatalogProvider(), {
      execute: vi.fn(),
    }).register({ tool } as never);

    expect(tool.mock.calls.map(([name]) => name)).toContain(
      "add_event_dish_and_sync_prep",
    );
  });

  it("loads only the selected dish and event reconciliation state", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        { _id: "template-1", dishId: "dish-1", name: "Keep", status: "active" },
        {
          _id: "template-2",
          dishId: "dish-2",
          name: "Ignore",
          status: "active",
        },
      ])
      .mockResolvedValueOnce([
        {
          _id: "task-1",
          eventId: "event-1",
          eventDishId: "event-dish-1",
          name: "Keep",
          quantity: 1,
          unit: "portion",
          isGenerated: true,
          status: "pending",
        },
        {
          _id: "task-2",
          eventId: "event-2",
          eventDishId: "event-dish-2",
          name: "Ignore",
          quantity: 1,
          unit: "portion",
          isGenerated: true,
          status: "pending",
        },
      ])
      .mockResolvedValueOnce([
        {
          _id: "demand-1",
          eventId: "event-1",
          ingredientId: "ingredient-1",
          requiredQuantity: 1,
          unit: "portion",
          status: "calculated",
          version: 1,
        },
      ]);

    const result = await new CapsuleLiveEventPrepStateLoader({ query }).load({
      eventId: "event-1",
      dishId: "dish-1",
    });

    expect(result.templates).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.demands).toHaveLength(1);
  });

  it("exposes generated-prep capabilities (recipe demand is Manifest-owned)", () => {
    const catalog = new CapsuleCommandCatalog();

    expect(catalog.get("EventDish.addToEvent").mutationName).toBe(
      "EventDish_createViaAddToEvent",
    );
    expect(catalog.get("PrepTask.refreshGenerated").mutationName).toBe(
      "PrepTask_refreshGenerated",
    );
  });

  it("creates an event dish then syncs prep tasks without host demand create", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ docId: "event-dish-1" })
      .mockResolvedValue({ docId: "created" });
    const loader: CapsuleEventPrepStateLoader = {
      load: vi.fn().mockResolvedValue({
        templates: [
          {
            id: "template-1",
            dishId: "dish-1",
            name: "Portion vegetables",
            defaultQuantity: 1,
            defaultUnit: "portion",
            ingredientId: "ingredient-1",
            status: "active",
          },
        ],
        tasks: [],
        demands: [
          {
            id: "demand-1",
            eventId: "event-1",
            ingredientId: "ingredient-1",
            requiredQuantity: 40,
            unit: "portion",
            status: "calculated",
            version: 1,
          },
        ],
      }),
    };
    const coordinator = new CapsuleEventPrepCoordinator({ execute }, loader);

    await expect(
      coordinator.addDishAndSync({
        eventId: "event-1",
        dishId: "dish-1",
        quantityServings: 40,
        course: "side",
        idempotencyKey: "test-event-dish",
      }),
    ).resolves.toEqual({
      eventDishId: "event-dish-1",
      taskCount: 1,
      demandCount: 0,
    });

    expect(execute).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        capabilityId: "EventDish.addToEvent",
        idempotencyKey: "test-event-dish:event-dish",
      }),
    );
    expect(execute).not.toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: "IngredientDemand.calculate",
      }),
    );
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityId: "PrepTask.open",
      }),
    );
  });
});
