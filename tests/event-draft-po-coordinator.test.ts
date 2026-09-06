import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  EventDraftPoCoordinator,
  eventAllowsDraftPoFromNeeds,
} from "../src/features/events/EventDraftPoCoordinator";

const CONTRACT_STAGES = ["planning", "quote", "sales_lock"] as const;
const BLOCKED_STAGES = [
  "pending_approval",
  "approved",
  "executing",
  "cancelled",
] as const;

function ports() {
  return {
    createOrder: vi.fn().mockResolvedValue({ docId: "po-1" }),
    createLine: vi.fn().mockResolvedValue({ docId: "line-1" }),
  };
}

function needInput(stage: string) {
  return {
    eventId: "nn7ez3fz56ya246m6p17az2ad58crnwg",
    eventStage: stage,
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
  };
}

describe("EventDraftPoCoordinator", () => {
  it("lets only planning / quote / sales_lock draft a PO from needs", () => {
    expect(eventAllowsDraftPoFromNeeds("planning")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("sales_lock")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("quote")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("approved")).toBe(false);
    expect(eventAllowsDraftPoFromNeeds("pending_approval")).toBe(false);
    expect(eventAllowsDraftPoFromNeeds("executing")).toBe(false);
    expect(eventAllowsDraftPoFromNeeds("cancelled")).toBe(false);
  });

  it("draftFromNeeds writes VendorOrder + lines from existing IngredientDemand on contract stages", async () => {
    for (const stage of CONTRACT_STAGES) {
      const { createOrder, createLine } = ports();
      const coordinator = new EventDraftPoCoordinator({
        createOrder,
        createLine,
      });
      const result = await coordinator.draftFromNeeds(needInput(stage));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.createdOrder).toBe(true);
        expect(result.lineCount).toBe(1);
        expect(result.vendorOrderId).toBe("po-1");
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
    }
  });

  it("blocks pending_approval / approved / executing instead of writing a second PO", async () => {
    for (const stage of BLOCKED_STAGES) {
      const { createOrder, createLine } = ports();
      const coordinator = new EventDraftPoCoordinator({
        createOrder,
        createLine,
      });
      const result = await coordinator.draftFromNeeds(needInput(stage));
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toMatch(/cannot draft a po/i);
      }
      expect(createOrder).not.toHaveBeenCalled();
      expect(createLine).not.toHaveBeenCalled();
    }
  });

  it("does not invent a catalog conversion when demand unit mismatches stock unit", async () => {
    const { createOrder, createLine } = ports();
    const coordinator = new EventDraftPoCoordinator({
      createOrder,
      createLine,
    });
    await coordinator.draftFromNeeds(needInput("planning"));
    expect(createLine).toHaveBeenCalledWith(
      expect.objectContaining({ unit: "each", unitCost: 0 }),
    );
  });

  it("continues an existing event draft with that draft's vendor", async () => {
    const materialize = vi
      .fn()
      .mockResolvedValue({ vendorOrderId: "po-1", lineCount: 7 });
    const coordinator = new EventDraftPoCoordinator({
      ...ports(),
      materialize,
    });
    const result = await coordinator.draftFromNeeds({
      ...needInput("planning"),
      vendorId: "new-default-vendor",
      orders: [
        {
          id: "po-1",
          eventId: needInput("planning").eventId,
          vendorId: "original-vendor",
          status: "draft",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.lineCount).toBe(7);
    expect(materialize).toHaveBeenCalledWith(
      expect.objectContaining({
        existingOrderId: "po-1",
        vendorId: "original-vendor",
      }),
    );
  });

  it("explains why a draft is blocked instead of silently no-opping", async () => {
    const coordinator = new EventDraftPoCoordinator(ports());
    const cancelled = await coordinator.draftFromNeeds({
      ...needInput("cancelled"),
      demands: [],
    });
    expect(cancelled).toEqual({
      ok: false,
      reason: "Cannot draft a PO while the event is cancelled.",
    });

    const empty = await coordinator.draftFromNeeds({
      ...needInput("planning"),
      demands: [],
    });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.reason).toMatch(/no ingredient needs/i);
    }
  });

  it("does not call PurchaseNeed.create — that stays behind Event.approve", () => {
    const coordinator = readFileSync(
      "src/features/events/EventDraftPoCoordinator.ts",
      "utf8",
    );
    const button = readFileSync(
      "src/features/events/EventDraftPoButton.tsx",
      "utf8",
    );
    expect(coordinator).not.toMatch(/PurchaseNeed/);
    expect(button).not.toMatch(/PurchaseNeed/);
    expect(coordinator).not.toContain("pending_approval");
    expect(coordinator).not.toContain('"approved"');
    expect(coordinator).not.toContain("executing");
  });
});
