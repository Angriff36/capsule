import { describe, expect, it, vi } from "vitest";
import { EventStockReservationCoordinator } from "../src/features/events/EventStockReservationCoordinator";

describe("EventStockReservationCoordinator", () => {
  it("reserves available stock, reports shortages, and does not double-reserve", async () => {
    const createReservation = vi
      .fn()
      .mockImplementation(async (input: { inventoryItemId: string }) => ({
        docId: `res-${input.inventoryItemId}`,
      }));
    const coordinator = new EventStockReservationCoordinator({
      createReservation,
    });

    const demands = [
      {
        id: "demand-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        requiredQuantity: 10,
        unit: "kilogram",
        status: "calculated",
      },
      {
        id: "demand-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        requiredQuantity: 5,
        unit: "kilogram",
        status: "confirmed",
      },
    ];
    const items = [
      {
        id: "item-flour",
        ingredientId: "ingredient-flour",
        quantityOnHand: 12,
        unit: "kilogram",
        stockedAt: 1,
      },
      {
        id: "item-sugar",
        ingredientId: "ingredient-sugar",
        quantityOnHand: 2,
        unit: "kilogram",
        stockedAt: 1,
      },
    ];

    const first = await coordinator.allocate({
      eventId: "event-1",
      demands,
      items,
      reservations: [],
    });

    expect(createReservation).toHaveBeenCalledTimes(2);
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        quantity: 10,
      }),
    );
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        quantity: 2,
      }),
    );
    expect(first.created).toEqual([
      {
        inventoryItemId: "item-flour",
        ingredientId: "ingredient-flour",
        quantity: 10,
        unit: "kilogram",
      },
      {
        inventoryItemId: "item-sugar",
        ingredientId: "ingredient-sugar",
        quantity: 2,
        unit: "kilogram",
      },
    ]);
    expect(first.shortages).toEqual([
      {
        ingredientId: "ingredient-sugar",
        unit: "kilogram",
        requiredQuantity: 5,
        reservedQuantity: 2,
        shortageQuantity: 3,
      },
    ]);

    // Second run sees active holds — only remaining sugar need is attempted,
    // but availableQuantity is already 0 after the first hold.
    createReservation.mockClear();
    const second = await coordinator.allocate({
      eventId: "event-1",
      demands,
      items,
      reservations: [
        {
          id: "res-flour",
          inventoryItemId: "item-flour",
          eventId: "event-1",
          ingredientId: "ingredient-flour",
          quantity: 10,
          status: "active",
        },
        {
          id: "res-sugar",
          inventoryItemId: "item-sugar",
          eventId: "event-1",
          ingredientId: "ingredient-sugar",
          quantity: 2,
          status: "active",
        },
      ],
    });

    expect(createReservation).not.toHaveBeenCalled();
    expect(second.created).toEqual([]);
    expect(second.shortages).toEqual([
      {
        ingredientId: "ingredient-sugar",
        unit: "kilogram",
        requiredQuantity: 5,
        reservedQuantity: 2,
        shortageQuantity: 3,
      },
    ]);
  });
});
