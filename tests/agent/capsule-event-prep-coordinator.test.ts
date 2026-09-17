import { describe, expect, it, vi } from "vitest";
import { CapsuleCommandCatalog } from "../../src/agent/CapsuleCommandCatalog";
import { CapsuleLiveEventPrepStateLoader } from "../../src/agent/CapsuleLiveEventPrepStateLoader";
import { CapsuleMcpToolRegistrar } from "../../src/agent/mcp/CapsuleMcpToolRegistrar";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ConvexHttpClient } from "convex/browser";
import { getFunctionName } from "convex/server";
import { CapsuleAgentAuthManager } from "../../src/agent/CapsuleAgentAuthManager";
import { McpToolCallResultParser } from "../../src/agent/mcp/McpToolCallResultParser";

describe("CapsuleEventPrepCoordinator", () => {
  it("adds a dish over MCP and reads its generated prep without duplicate host writes", async () => {
    // Credential/network boundaries are doubled; tool dispatch, loader, filtering,
    // and result filtering execute their production code; generated writes are
    // exercised separately by the backend runtime proofs.
    vi.spyOn(CapsuleAgentAuthManager.prototype, "resolveJwt").mockResolvedValue(
      "fixture-token",
    );
    vi.spyOn(
      CapsuleAgentAuthManager.prototype,
      "resolveConvexUrl",
    ).mockReturnValue("https://fixture.convex.cloud");
    vi.spyOn(ConvexHttpClient.prototype, "query").mockImplementation(
      async (reference, ..._args) => {
        if (getFunctionName(reference) === "queries:listDishTaskByDishId")
          return [
            {
              _id: "selected-template",
              dishId: "dish-a",
              name: "Portion carrots",
              status: "active",
              defaultQuantity: 0.375,
              defaultUnit: "pound",
              instructions: "Weigh after cooking",
            },
            {
              _id: "other-template",
              dishId: "dish-b",
              name: "Wrong dish",
              status: "active",
              defaultQuantity: 99,
              defaultUnit: "each",
            },
          ];
        if (getFunctionName(reference) === "queries:listPrepTaskByEventId")
          return [
            {
              _id: "prep-a",
              eventId: "event-a",
              eventDishId: "event-dish-a",
              name: "Portion carrots",
              quantity: 15,
              unit: "pound",
              isGenerated: true,
              status: "pending",
            },
            {
              _id: "prep-other",
              eventId: "event-a",
              eventDishId: "event-dish-b",
              name: "Other dish",
              quantity: 1,
              unit: "each",
              isGenerated: true,
              status: "pending",
            },
            {
              _id: "prep-cancelled",
              eventId: "event-a",
              eventDishId: "event-dish-a",
              name: "Cancelled",
              quantity: 1,
              unit: "each",
              isGenerated: true,
              status: "cancelled",
            },
          ];
        return [];
      },
    );
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ docId: "event-dish-a" })
      .mockResolvedValue({ docId: "prep-a" });
    const server = new McpServer({ name: "prep-test", version: "1" });
    new CapsuleMcpToolRegistrar(new CapsuleCommandCatalog(), {
      execute,
    }).register(server);
    const client = new Client({ name: "prep-client", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const result = await client.callTool({
        name: "add_event_dish_and_sync_prep",
        arguments: {
          eventId: "event-a",
          dishId: "dish-a",
          quantityServings: 40,
          course: "side",
          idempotencyKey: "booking-a",
        },
      });
      expect(
        new McpToolCallResultParser().parseObject(
          result as { content?: unknown; isError?: boolean },
        ),
      ).toEqual({
        ok: true,
        result: { eventDishId: "event-dish-a", taskCount: 1 },
      });
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute).not.toHaveBeenCalledWith(
        expect.objectContaining({ capabilityId: "IngredientDemand.calculate" }),
      );
      expect(execute.mock.calls[0][0]).toEqual({
        capabilityId: "EventDish.addToEvent",
        args: {
          eventId: "event-a",
          dishId: "dish-a",
          quantityServings: 40,
          course: "side",
          serviceStyle: undefined,
          specialInstructions: undefined,
        },
        idempotencyKey: "booking-a:event-dish",
      });
    } finally {
      await client.close();
      await server.close();
      vi.restoreAllMocks();
    }
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
        {
          _id: "demand-2",
          eventId: "event-2",
          ingredientId: "ingredient-2",
          requiredQuantity: 99,
          unit: "portion",
          status: "calculated",
          version: 1,
        },
      ]);

    const result = await new CapsuleLiveEventPrepStateLoader({ query }).load({
      eventId: "event-1",
      dishId: "dish-1",
    });

    expect(result.templates.map((row) => row.id)).toEqual(["template-1"]);
    expect(result.tasks.map((row) => row.id)).toEqual(["task-1"]);
    expect(result.demands.map((row) => row.id)).toEqual(["demand-1"]);
  });

  it("exposes generated-prep capabilities (component demand is Manifest-owned)", () => {
    const catalog = new CapsuleCommandCatalog();

    expect(catalog.get("EventDish.addToEvent").mutationName).toBe(
      "EventDish_createViaAddToEvent",
    );
    expect(catalog.get("PrepTask.refreshGenerated").mutationName).toBe(
      "PrepTask_refreshGenerated",
    );
  });
});
