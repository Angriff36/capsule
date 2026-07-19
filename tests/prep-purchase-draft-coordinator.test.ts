import { describe, expect, it, vi } from "vitest";
import {
  PrepPurchaseDraftCoordinator,
  type PrepPurchaseNeed,
} from "../src/features/inventory/PrepPurchaseDraftCoordinator";

const DAY = 24 * 60 * 60 * 1000;

function need(overrides: Partial<PrepPurchaseNeed> = {}): PrepPurchaseNeed {
  return {
    id: "need-1",
    version: 0,
    eventId: "event-1",
    ingredientId: "ingredient-tomato",
    requiredQuantity: 2,
    unit: "kilogram",
    status: "open",
    ...overrides,
  };
}

describe("PrepPurchaseDraftCoordinator", () => {
  it("combines matching open needs in the selected date range into one draft line", async () => {
    const openOrder = vi.fn().mockResolvedValue({ docId: "order-1" });
    const addLine = vi.fn().mockResolvedValue({ docId: "line-1" });
    const assignNeedToDraft = vi.fn().mockResolvedValue(undefined);
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder,
      addLine,
      assignNeedToDraft,
    });

    const result = await coordinator.generate({
      vendorId: "vendor-1",
      rangeStart: 10 * DAY,
      rangeEnd: 17 * DAY,
      needs: [
        need(),
        need({ id: "need-2", eventId: "event-2", requiredQuantity: 3 }),
      ],
      events: [
        { id: "event-1", startsAt: 12 * DAY },
        { id: "event-2", startsAt: 13 * DAY },
      ],
    });

    expect(result).toEqual({ orderId: "order-1", lineCount: 1, needCount: 2 });
    expect(openOrder).toHaveBeenCalledWith({
      vendorId: "vendor-1",
      sourceRangeStart: 10 * DAY,
      sourceRangeEnd: 17 * DAY,
    });
    expect(addLine).toHaveBeenCalledWith({
      vendorOrderId: "order-1",
      ingredientId: "ingredient-tomato",
      orderedQuantity: 5,
      unit: "kilogram",
      unitCost: 0,
    });
    expect(assignNeedToDraft).toHaveBeenCalledTimes(2);
    expect(assignNeedToDraft).toHaveBeenCalledWith({
      docId: "need-1",
      version: 0,
      vendorOrderId: "order-1",
      vendorOrderLineId: "line-1",
    });
  });

  it("excludes needs outside the range and separates units", async () => {
    const addLine = vi
      .fn()
      .mockResolvedValueOnce({ docId: "line-kg" })
      .mockResolvedValueOnce({ docId: "line-each" });
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder: vi.fn().mockResolvedValue({ docId: "order-1" }),
      addLine,
      assignNeedToDraft: vi.fn().mockResolvedValue(undefined),
    });

    await coordinator.generate({
      vendorId: "vendor-1",
      rangeStart: 10 * DAY,
      rangeEnd: 17 * DAY,
      needs: [
        need(),
        need({ id: "need-each", unit: "each", requiredQuantity: 4 }),
        need({ id: "need-old", eventId: "event-old", requiredQuantity: 9 }),
      ],
      events: [
        { id: "event-1", startsAt: 12 * DAY },
        { id: "event-old", startsAt: 9 * DAY },
      ],
    });

    expect(addLine).toHaveBeenCalledTimes(2);
    expect(addLine).toHaveBeenCalledWith(
      expect.objectContaining({ unit: "kilogram", orderedQuantity: 2 }),
    );
    expect(addLine).toHaveBeenCalledWith(
      expect.objectContaining({ unit: "each", orderedQuantity: 4 }),
    );
  });

  it("rejects inverted ranges and an empty eligible selection before opening an order", async () => {
    const openOrder = vi.fn();
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder,
      addLine: vi.fn(),
      assignNeedToDraft: vi.fn(),
    });

    await expect(
      coordinator.generate({
        vendorId: "vendor-1",
        rangeStart: 17 * DAY,
        rangeEnd: 10 * DAY,
        needs: [],
        events: [],
      }),
    ).rejects.toThrow("Purchase draft range end must not precede its start");

    await expect(
      coordinator.generate({
        vendorId: "vendor-1",
        rangeStart: 10 * DAY,
        rangeEnd: 17 * DAY,
        needs: [need({ status: "ordered" })],
        events: [{ id: "event-1", startsAt: 12 * DAY }],
      }),
    ).rejects.toThrow("No open purchase needs fall within this date range");
    expect(openOrder).not.toHaveBeenCalled();
  });
});
