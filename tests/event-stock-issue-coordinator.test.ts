import { describe, expect, it, vi } from "vitest";
import { EventStockIssueCoordinator } from "../src/features/events/EventStockIssueCoordinator";

describe("EventStockIssueCoordinator", () => {
  it("issues partial then full consumption, deducts stock, fulfills demand, and blocks duplicates", async () => {
    const consumeReservation = vi.fn().mockResolvedValue(undefined);
    const confirmDemand = vi.fn().mockResolvedValue(undefined);
    const fulfillDemand = vi.fn().mockResolvedValue(undefined);
    const coordinator = new EventStockIssueCoordinator({
      consumeReservation,
      confirmDemand,
      fulfillDemand,
    });

    const items = [
      {
        id: "item-flour",
        quantityOnHand: 20,
        locationId: "loc-cooler",
        unit: "kilogram",
      },
    ];
    const demands = [
      {
        id: "demand-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        requiredQuantity: 10,
        unit: "kilogram",
        status: "calculated",
        version: 1,
      },
    ];
    let reservations = [
      {
        id: "res-partial",
        inventoryItemId: "item-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        quantity: 4,
        status: "active",
        version: 1,
      },
      {
        id: "res-remainder",
        inventoryItemId: "item-flour",
        eventId: "event-1",
        ingredientId: "ingredient-flour",
        quantity: 6,
        status: "active",
        version: 1,
      },
    ];

    // Partial issue — demand stays open; stock reaction delta is −4.
    const partial = await coordinator.issue({
      eventId: "event-1",
      reservationId: "res-partial",
      reservations,
      demands,
      items,
    });
    expect(consumeReservation).toHaveBeenCalledWith({
      docId: "res-partial",
      version: 1,
    });
    expect(partial.stockAdjustment).toEqual({
      inventoryItemId: "item-flour",
      previousQuantity: 20,
      quantityOnHand: 16,
      delta: -4,
      reason: "Reservation consumed",
    });
    expect(partial.fulfilledDemandId).toBeNull();
    expect(partial.demandPreserved).toBe(true);
    expect(confirmDemand).not.toHaveBeenCalled();
    expect(fulfillDemand).not.toHaveBeenCalled();

    reservations = reservations.map((row) =>
      row.id === "res-partial" ? { ...row, status: "consumed" } : row,
    );
    items[0] = {
      ...items[0],
      quantityOnHand: partial.stockAdjustment.quantityOnHand,
    };

    // Completing consumption fulfills demand (confirm → fulfill) and deducts 6.
    const full = await coordinator.issue({
      eventId: "event-1",
      reservationId: "res-remainder",
      reservations,
      demands,
      items,
    });
    expect(consumeReservation).toHaveBeenCalledWith({
      docId: "res-remainder",
      version: 1,
    });
    expect(full.stockAdjustment).toEqual({
      inventoryItemId: "item-flour",
      previousQuantity: 16,
      quantityOnHand: 10,
      delta: -6,
      reason: "Reservation consumed",
    });
    expect(confirmDemand).toHaveBeenCalledWith({
      docId: "demand-flour",
      version: 1,
    });
    expect(fulfillDemand).toHaveBeenCalledWith({
      docId: "demand-flour",
      version: 3,
    });
    expect(full.fulfilledDemandId).toBe("demand-flour");
    expect(full.demandPreserved).toBe(false);

    reservations = reservations.map((row) =>
      row.id === "res-remainder" ? { ...row, status: "consumed" } : row,
    );
    consumeReservation.mockClear();

    // Duplicate issue on an already-consumed hold is rejected.
    await expect(
      coordinator.issue({
        eventId: "event-1",
        reservationId: "res-partial",
        reservations,
        demands: [{ ...demands[0], status: "fulfilled", version: 3 }],
        items,
      }),
    ).rejects.toThrow("Reservation is not active");
    expect(consumeReservation).not.toHaveBeenCalled();
  });
});
