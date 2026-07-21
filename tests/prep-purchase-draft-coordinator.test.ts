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
    ingredientDemandId: "demand-1",
    ...overrides,
  };
}

describe("PrepPurchaseDraftCoordinator", () => {
  it("combines matching open needs in the selected date range into one draft line", async () => {
    const openOrder = vi.fn().mockResolvedValue({ docId: "order-1" });
    const addLine = vi.fn().mockResolvedValue({ docId: "line-1" });
    const assignNeedToDraft = vi.fn().mockResolvedValue(undefined);
    const linkDemand = vi.fn().mockResolvedValue({ docId: "link-1" });
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder,
      addLine,
      assignNeedToDraft,
      linkDemand,
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
    expect(linkDemand).toHaveBeenCalledWith({
      vendorOrderLineId: "line-1",
      ingredientDemandId: "demand-1",
      vendorOrderId: "order-1",
      contributionQuantity: 2,
      unit: "kilogram",
    });
    expect(assignNeedToDraft).toHaveBeenCalledTimes(2);
  });

  it("groups onions and chicken into separate lines and links each need once", async () => {
    const addLine = vi
      .fn()
      .mockResolvedValueOnce({ docId: "line-onion" })
      .mockResolvedValueOnce({ docId: "line-chicken" });
    const linkDemand = vi.fn().mockResolvedValue({ docId: "link" });
    const assignNeedToDraft = vi.fn().mockResolvedValue(undefined);
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder: vi.fn().mockResolvedValue({ docId: "order-week" }),
      addLine,
      linkDemand,
      assignNeedToDraft,
    });

    const result = await coordinator.generate({
      vendorId: "vendor-1",
      rangeStart: 10 * DAY,
      rangeEnd: 17 * DAY,
      needs: [
        need({
          id: "need-onion",
          ingredientId: "ingredient-onion",
          ingredientDemandId: "demand-onion",
          requiredQuantity: 5,
          unit: "each",
        }),
        need({
          id: "need-chicken",
          ingredientId: "ingredient-chicken",
          ingredientDemandId: "demand-chicken",
          requiredQuantity: 20,
          unit: "each",
        }),
        need({
          id: "need-elsewhere",
          ingredientId: "ingredient-onion",
          ingredientDemandId: "demand-elsewhere",
          requiredQuantity: 99,
          unit: "each",
          vendorOrderId: "order-other",
        }),
      ],
      events: [{ id: "event-1", startsAt: 12 * DAY }],
    });

    expect(result).toEqual({
      orderId: "order-week",
      lineCount: 2,
      needCount: 2,
    });
    expect(addLine).toHaveBeenCalledTimes(2);
    expect(linkDemand).toHaveBeenCalledTimes(2);
    expect(linkDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredientDemandId: "demand-chicken",
        vendorOrderId: "order-week",
        contributionQuantity: 20,
        unit: "each",
      }),
    );
    expect(linkDemand).not.toHaveBeenCalledWith(
      expect.objectContaining({ ingredientDemandId: "demand-elsewhere" }),
    );
    expect(assignNeedToDraft).toHaveBeenCalledTimes(2);
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
  });

  it("excludes needs already assigned to a different vendor order draft", async () => {
    const addLine = vi.fn().mockResolvedValue({ docId: "line-1" });
    const assignNeedToDraft = vi.fn().mockResolvedValue(undefined);
    const linkDemand = vi.fn().mockResolvedValue({ docId: "link-1" });
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder: vi.fn().mockResolvedValue({ docId: "order-new" }),
      addLine,
      assignNeedToDraft,
      linkDemand,
    });

    const result = await coordinator.generate({
      vendorId: "vendor-1",
      rangeStart: 10 * DAY,
      rangeEnd: 17 * DAY,
      needs: [
        need({ requiredQuantity: 2 }),
        need({
          id: "need-other-draft",
          ingredientDemandId: "demand-other",
          requiredQuantity: 9,
          vendorOrderId: "order-other",
          vendorOrderLineId: "line-other",
        }),
      ],
      events: [{ id: "event-1", startsAt: 12 * DAY }],
    });

    expect(result).toEqual({
      orderId: "order-new",
      lineCount: 1,
      needCount: 1,
    });
    expect(addLine).toHaveBeenCalledWith(
      expect.objectContaining({ orderedQuantity: 2 }),
    );
  });

  it("rolls back a newly opened order when linkDemand fails", async () => {
    const openOrder = vi.fn().mockResolvedValue({ docId: "order-orphan" });
    const addLine = vi.fn().mockResolvedValue({ docId: "line-orphan" });
    const cancelOrder = vi.fn().mockResolvedValue(undefined);
    const cancelLine = vi.fn().mockResolvedValue(undefined);
    const retireDemandLink = vi.fn().mockResolvedValue(undefined);
    const assignNeedToDraft = vi.fn();
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder,
      addLine,
      linkDemand: vi
        .fn()
        .mockResolvedValueOnce({ docId: "link-ok" })
        .mockRejectedValueOnce(new Error("Guard 2 failed")),
      assignNeedToDraft,
      cancelOrder,
      cancelLine,
      retireDemandLink,
    });

    await expect(
      coordinator.generate({
        vendorId: "vendor-1",
        rangeStart: 10 * DAY,
        rangeEnd: 17 * DAY,
        needs: [
          need({
            id: "need-onion",
            ingredientId: "ingredient-onion",
            ingredientDemandId: "demand-onion",
            unit: "each",
          }),
          need({
            id: "need-chicken",
            ingredientId: "ingredient-chicken",
            ingredientDemandId: "demand-chicken",
            unit: "each",
            requiredQuantity: 20,
          }),
        ],
        events: [{ id: "event-1", startsAt: 12 * DAY }],
      }),
    ).rejects.toThrow("Guard 2 failed");

    expect(retireDemandLink).toHaveBeenCalledWith({
      docId: "link-ok",
      reason: "Prep-list draft generate failed; aborting partial draft",
    });
    expect(cancelOrder).toHaveBeenCalledWith({
      docId: "order-orphan",
      reason: "Prep-list draft generate failed; aborting partial draft",
    });
    expect(assignNeedToDraft).not.toHaveBeenCalled();
    expect(cancelLine).not.toHaveBeenCalled();
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

  it("reuses the matching weekly draft and updates its line provenance", async () => {
    const openOrder = vi.fn();
    const reviseLine = vi.fn().mockResolvedValue(undefined);
    const linkDemand = vi.fn().mockResolvedValue({ docId: "link-2" });
    const assignNeedToDraft = vi.fn().mockResolvedValue(undefined);
    const coordinator = new PrepPurchaseDraftCoordinator({
      openOrder,
      addLine: vi.fn(),
      reviseLine,
      linkDemand,
      assignNeedToDraft,
    });

    const result = await coordinator.generate({
      vendorId: "vendor-1",
      rangeStart: 10 * DAY,
      rangeEnd: 17 * DAY,
      needs: [
        need(),
        need({
          id: "need-2",
          ingredientDemandId: "demand-2",
          requiredQuantity: 3,
        }),
      ],
      events: [{ id: "event-1", startsAt: 12 * DAY }],
      orders: [
        {
          id: "order-week",
          vendorId: "vendor-1",
          sourceRangeStart: 10 * DAY,
          sourceRangeEnd: 17 * DAY,
          status: "draft",
        },
      ],
      lines: [
        {
          id: "line-tomato",
          vendorOrderId: "order-week",
          ingredientId: "ingredient-tomato",
          orderedQuantity: 2,
          unit: "kilogram",
          status: "added",
        },
      ],
      demandLinks: [
        {
          id: "link-1",
          vendorOrderLineId: "line-tomato",
          ingredientDemandId: "demand-1",
          contributionQuantity: 2,
          unit: "kilogram",
          version: 1,
        },
      ],
    });

    expect(result).toEqual({
      orderId: "order-week",
      lineCount: 1,
      needCount: 2,
    });
    expect(openOrder).not.toHaveBeenCalled();
    expect(linkDemand).toHaveBeenCalledWith({
      vendorOrderLineId: "line-tomato",
      ingredientDemandId: "demand-2",
      vendorOrderId: "order-week",
      contributionQuantity: 3,
      unit: "kilogram",
    });
  });
});
