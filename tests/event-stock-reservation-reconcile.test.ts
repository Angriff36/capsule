import { describe, expect, it, vi } from "vitest";
import { EventStockReservationCoordinator } from "../src/features/events/EventStockReservationCoordinator";

describe("EventStockReservationCoordinator.reconcile", () => {
  it("tops up, releases excess, preserves consumed, reports shortage, and is idempotent", async () => {
    const createReservation = vi
      .fn()
      .mockImplementation(
        async (input: { inventoryItemId: string; quantity: number }) => ({
          docId: `res-${input.inventoryItemId}-${input.quantity}`,
        }),
      );
    const releaseReservation = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EventStockReservationCoordinator({
      createReservation,
      releaseReservation,
    });

    const items = [
      {
        id: "item-flour",
        ingredientId: "ingredient-flour",
        quantityOnHand: 20,
        unit: "kilogram",
        stockedAt: 1,
      },
      {
        id: "item-sugar",
        ingredientId: "ingredient-sugar",
        quantityOnHand: 4,
        unit: "kilogram",
        stockedAt: 1,
      },
      {
        id: "item-butter",
        ingredientId: "ingredient-butter",
        quantityOnHand: 10,
        unit: "kilogram",
        stockedAt: 1,
      },
    ];

    // Starting holds: flour 10 active, sugar 5 active + 3 consumed, butter 4 active.
    let reservations = [
      {
        id: "res-flour",
        inventoryItemId: "item-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        quantity: 10,
        status: "active",
        version: 1,
      },
      {
        id: "res-sugar-active",
        inventoryItemId: "item-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        quantity: 5,
        status: "active",
        version: 1,
      },
      {
        id: "res-sugar-consumed",
        inventoryItemId: "item-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        quantity: 3,
        status: "consumed",
        version: 2,
      },
      {
        id: "res-butter",
        inventoryItemId: "item-butter",
        eventId: "event-1",
        ingredientId: "ingredient-butter",
        quantity: 4,
        status: "active",
        version: 1,
      },
    ];

    // New demand: flour ↑ to 15, sugar ↓ to 6 (consumed 3 → keep 3 active),
    // butter removed (0), salt ↑ with only 4kg on hand against need 8.
    const demands = [
      {
        id: "demand-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        requiredQuantity: 15,
        unit: "kilogram",
        status: "calculated",
      },
      {
        id: "demand-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        requiredQuantity: 6,
        unit: "kilogram",
        status: "calculated",
      },
      {
        id: "demand-salt",
        eventId: "event-1",
        ingredientId: "ingredient-salt",
        requiredQuantity: 8,
        unit: "kilogram",
        status: "calculated",
      },
    ];
    items.push({
      id: "item-salt",
      ingredientId: "ingredient-salt",
      quantityOnHand: 4,
      unit: "kilogram",
      stockedAt: 1,
    });

    const first = await coordinator.reconcile({
      eventId: "event-1",
      demands,
      items,
      reservations,
    });

    // Flour increase: reserve +5
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-flour",
        ingredientId: "ingredient-flour",
        quantity: 5,
      }),
    );
    // Sugar decrease: release 5 active, recreate keep 3 (demand 6 − consumed 3)
    expect(releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        docId: "res-sugar-active",
        version: 1,
      }),
    );
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-sugar",
        ingredientId: "ingredient-sugar",
        quantity: 3,
      }),
    );
    // Butter removed: release remaining active
    expect(releaseReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        docId: "res-butter",
        version: 1,
      }),
    );
    // Consumed sugar row is never released
    expect(releaseReservation).not.toHaveBeenCalledWith(
      expect.objectContaining({ docId: "res-sugar-consumed" }),
    );
    // Salt shortage: only 4 available
    expect(createReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        inventoryItemId: "item-salt",
        ingredientId: "ingredient-salt",
        quantity: 4,
      }),
    );
    expect(first.shortages).toEqual([
      {
        ingredientId: "ingredient-salt",
        unit: "kilogram",
        requiredQuantity: 8,
        reservedQuantity: 4,
        shortageQuantity: 4,
      },
    ]);

    // Apply mutations into local reservation snapshot for the idempotent rerun.
    reservations = [
      {
        id: "res-flour",
        inventoryItemId: "item-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        quantity: 10,
        status: "active",
        version: 1,
      },
      {
        id: "res-flour-topup",
        inventoryItemId: "item-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        quantity: 5,
        status: "active",
        version: 1,
      },
      {
        id: "res-sugar-consumed",
        inventoryItemId: "item-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        quantity: 3,
        status: "consumed",
        version: 2,
      },
      {
        id: "res-sugar-keep",
        inventoryItemId: "item-sugar",
        eventId: "event-1",
        ingredientId: "ingredient-sugar",
        quantity: 3,
        status: "active",
        version: 1,
      },
      {
        id: "res-salt",
        inventoryItemId: "item-salt",
        eventId: "event-1",
        ingredientId: "ingredient-salt",
        quantity: 4,
        status: "active",
        version: 1,
      },
    ];

    createReservation.mockClear();
    releaseReservation.mockClear();
    const second = await coordinator.reconcile({
      eventId: "event-1",
      demands,
      items,
      reservations,
    });

    expect(createReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    // Shortage still reported while unmet demand remains.
    expect(second.shortages).toEqual(first.shortages);
    expect(second.created).toEqual([]);
    expect(second.released).toEqual([]);
  });

  it("skips reconcile when the event has no prior reservations", async () => {
    const createReservation = vi.fn();
    const releaseReservation = vi.fn();
    const coordinator = new EventStockReservationCoordinator({
      createReservation,
      releaseReservation,
    });

    const result = await coordinator.reconcile({
      eventId: "event-1",
      demands: [
        {
          id: "demand-flour",
          eventId: "event-1",
          ingredientId: "ingredient-flour",
          requiredQuantity: 10,
          unit: "kilogram",
          status: "calculated",
        },
      ],
      items: [
        {
          id: "item-flour",
          ingredientId: "ingredient-flour",
          quantityOnHand: 20,
          unit: "kilogram",
          stockedAt: 1,
        },
      ],
      reservations: [],
    });

    expect(createReservation).not.toHaveBeenCalled();
    expect(releaseReservation).not.toHaveBeenCalled();
    expect(result).toEqual({ created: [], released: [], shortages: [] });
  });
});
