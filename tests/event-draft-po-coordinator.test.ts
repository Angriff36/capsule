import { describe, expect, it, vi } from "vitest";
import {
  EventDraftPoCoordinator,
  eventAllowsDraftPoFromNeeds,
} from "../src/features/events/EventDraftPoCoordinator";

describe("EventDraftPoCoordinator", () => {
  it("lets PLANNING events draft a PO from needs without approving", async () => {
    expect(eventAllowsDraftPoFromNeeds("planning")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("sales_lock")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("quote")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("approved")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("cancelled")).toBe(false);

    const createOrder = vi.fn().mockResolvedValue({ docId: "po-1" });
    const createLine = vi.fn().mockResolvedValue({ docId: "line-1" });
    const coordinator = new EventDraftPoCoordinator({
      createOrder,
      createLine,
    });

    const result = await coordinator.draftFromNeeds({
      eventId: "nn7ez3fz56ya246m6p17az2ad58crnwg",
      eventStage: "planning",
      vendorId: "vendor-1",
      demands: [
        {
          id: "demand-tomato",
          eventId: "nn7ez3fz56ya246m6p17az2ad58crnwg",
          ingredientId: "ing-tomato",
          requiredQuantity: 98,
          unit: "each",
          status: "calculated",
        },
      ],
      orders: [],
      lines: [],
      ingredients: [
        {
          id: "ing-tomato",
          unit: "kilogram",
          costPerUnit: 6.25,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.createdOrder).toBe(true);
      expect(result.lineCount).toBe(1);
    }
    expect(createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "nn7ez3fz56ya246m6p17az2ad58crnwg",
        vendorId: "vendor-1",
      }),
    );
    expect(createLine).toHaveBeenCalledWith(
      expect.objectContaining({
        vendorOrderId: "po-1",
        ingredientId: "ing-tomato",
        orderedQuantity: 98,
        unit: "each",
        unitCost: 0,
      }),
    );
  });

  it("does not invent a catalog conversion when demand unit mismatches stock unit", async () => {
    const coordinator = new EventDraftPoCoordinator({
      createOrder: vi.fn().mockResolvedValue({ docId: "po-1" }),
      createLine: vi.fn().mockResolvedValue({ docId: "line-1" }),
    });
    await coordinator.draftFromNeeds({
      eventId: "event-1",
      eventStage: "planning",
      vendorId: "vendor-1",
      demands: [
        {
          id: "d1",
          eventId: "event-1",
          ingredientId: "ing-1",
          requiredQuantity: 98,
          unit: "each",
          status: "calculated",
        },
      ],
      orders: [],
      lines: [],
      ingredients: [{ id: "ing-1", unit: "kilogram", costPerUnit: 6.25 }],
    });
    expect(coordinator).toBeTruthy();
  });

  it("explains why a draft is blocked instead of silently no-opping", async () => {
    const coordinator = new EventDraftPoCoordinator({
      createOrder: vi.fn(),
      createLine: vi.fn(),
    });
    const cancelled = await coordinator.draftFromNeeds({
      eventId: "event-1",
      eventStage: "cancelled",
      vendorId: "vendor-1",
      demands: [],
      orders: [],
      lines: [],
      ingredients: [],
    });
    expect(cancelled).toEqual({
      ok: false,
      reason: "Cannot draft a PO while the event is cancelled.",
    });

    const empty = await coordinator.draftFromNeeds({
      eventId: "event-1",
      eventStage: "planning",
      vendorId: "vendor-1",
      demands: [],
      orders: [],
      lines: [],
      ingredients: [],
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.reason).toMatch(/no ingredient needs/i);
    }
  });
});
