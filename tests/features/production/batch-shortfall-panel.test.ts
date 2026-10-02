// @vitest-environment jsdom
/**
 * PL-BATCH screen proof: the cook can enter waste when finishing a batch,
 * sees what a finished batch made against its plan and what it still owes,
 * and can settle the shortfall or fix a miscount with a reason.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenDisplayPage } from "../../../src/features/production/KitchenDisplayPage";
import { batchCompletionArgs } from "../../../src/features/production/batchCompletion";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout; the prompt scrolls itself into view.
Element.prototype.scrollIntoView = () => undefined;

const harness = vi.hoisted(() => ({
  complete: vi.fn<(args: unknown) => Promise<void>>(),
  resolve: vi.fn<(args: unknown) => Promise<void>>(),
  correct: vi.fn<(args: unknown) => Promise<void>>(),
}));

vi.mock("../../../src/features/facilities/useEventsById", () => ({
  useEventsById: () => [{ _id: "event-1", title: "Harbor gala" }],
}));

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useListProductionBatch: () => [
    {
      _id: "batch-live",
      version: 2,
      componentId: "component-1",
      plannedYield: 30,
      yieldUnit: "portion",
      status: "in_progress",
      deletedAt: null,
    },
    {
      _id: "batch-short",
      version: 5,
      componentId: "component-1",
      eventId: "event-1",
      plannedYield: 50,
      actualYield: 42,
      shortfallQuantity: 8,
      shortfallResolvedAt: null,
      wasteQuantity: 3,
      wasteReason: "Scorched tray",
      yieldUnit: "portion",
      status: "completed",
      completedAt: Date.now() - 60_000,
      deletedAt: null,
    },
  ],
  useListComponent: () => [{ _id: "component-1", name: "Short rib" }],
  useListPrepTask: () => [],
  useListPrepTaskDependency: () => [],
  useListEvent: () => [{ _id: "event-1", title: "Harbor gala" }],
  useListPerson: () => [],
  useProductionBatchComplete: () => harness.complete,
  useProductionBatchStart: () => vi.fn(async () => undefined),
  useProductionBatchCancel: () => vi.fn(async () => undefined),
  useCreateProductionBatch: () => vi.fn(async () => undefined),
  useProductionBatchCorrectYield: () => harness.correct,
  useProductionBatchResolveShortfall: () => harness.resolve,
  useListProductionBatchAllocation: () => [],
  useProductionBatchAllocationMarkPortioned: () => vi.fn(async () => undefined),
  usePrepTaskClaim: () => vi.fn(async () => undefined),
  usePrepTaskComplete: () => vi.fn(async () => undefined),
  usePrepTaskStart: () => vi.fn(async () => undefined),
}));

function setValue(
  input: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const proto =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("finished batches and batch waste", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    harness.complete.mockReset().mockResolvedValue(undefined);
    harness.resolve.mockReset().mockResolvedValue(undefined);
    harness.correct.mockReset().mockResolvedValue(undefined);
    await act(async () =>
      root.render(
        createElement(MemoryRouter, {}, createElement(KitchenDisplayPage)),
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const button = (text: string) =>
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === text,
    )!;
  const panel = () =>
    container.querySelector<HTMLElement>('[aria-label="Finished batches"]')!;

  it("sends the wasted amount and its reason with the counted yield", async () => {
    setValue(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Actual yield for Short rib in portion"]',
      )!,
      "28",
    );
    setValue(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Wasted amount for Short rib in portion"]',
      )!,
      "2",
    );
    setValue(
      container.querySelector<HTMLInputElement>(
        'input[aria-label="Why Short rib was wasted"]',
      )!,
      "Dropped a pan",
    );
    await act(async () => button("Done").click());
    expect(harness.complete).toHaveBeenCalledWith({
      docId: "batch-live",
      version: 2,
      actualYield: 28,
      wasteQuantity: 2,
      wasteReason: "Dropped a pan",
    });
  });

  it("shows made vs plan, waste and what is still owed", () => {
    const text = panel().textContent ?? "";
    expect(text).toContain("Still owed");
    expect(text).toContain("Made 42 of 50 portion · Short by 8 portion");
    expect(text).toContain("Wasted 3 portion · Scorched tray");
    expect(text).toContain("Harbor gala");
  });

  it("settles the shortfall with a reason", async () => {
    await act(async () => button("No more needed").click());
    setValue(
      panel().querySelector<HTMLTextAreaElement>("textarea[name=reason]")!,
      "Guest count dropped",
    );
    await act(async () =>
      panel()
        .querySelector<HTMLButtonElement>(
          '[data-testid="action-prompt-confirm"]',
        )!
        .click(),
    );
    expect(harness.resolve).toHaveBeenCalledWith({
      docId: "batch-short",
      version: 5,
      resolution: "Guest count dropped",
    });
  });

  it("fixes a miscount with a reason", async () => {
    await act(async () => button("Fix the count").click());
    setValue(
      panel().querySelector<HTMLInputElement>("input[name=count]")!,
      "45",
    );
    setValue(
      panel().querySelector<HTMLInputElement>("input[name=reason]")!,
      "Missed a pan in the walk-in",
    );
    await act(async () =>
      panel()
        .querySelector<HTMLButtonElement>(
          '[data-testid="action-prompt-confirm"]',
        )!
        .click(),
    );
    expect(harness.correct).toHaveBeenCalledWith({
      docId: "batch-short",
      version: 5,
      actualYield: 45,
      reason: "Missed a pan in the walk-in",
    });
  });

  it("needs a reason for wasted food and keeps a zero count", () => {
    expect(batchCompletionArgs({ yield: "0" })).toEqual({ actualYield: 0 });
    expect(() => batchCompletionArgs({ yield: "4", waste: "1" })).toThrow(
      "Say why the food was wasted.",
    );
    expect(() => batchCompletionArgs({ yield: "" })).toThrow(
      "Enter the actual batch yield.",
    );
  });
});
