// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenDisplayPage } from "../../../src/features/production/KitchenDisplayPage";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({ complete: vi.fn<() => Promise<void>>() }));

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useListProductionBatch: () => [
    {
      _id: "batch-1",
      version: 4,
      componentId: "component-1",
      plannedYield: 12,
      yieldUnit: "kg",
      status: "in_progress",
      deletedAt: null,
    },
  ],
  useListComponent: () => [{ _id: "component-1", name: "Tomato sauce" }],
  useListPrepTask: () => [],
  useListPrepTaskDependency: () => [],
  useListEvent: () => [],
  useProductionBatchComplete: () => harness.complete,
  useProductionBatchStart: () => vi.fn(async () => undefined),
  usePrepTaskClaim: () => vi.fn(async () => undefined),
  usePrepTaskComplete: () => vi.fn(async () => undefined),
  usePrepTaskStart: () => vi.fn(async () => undefined),
}));

describe("KitchenDisplayPage actual yield", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    harness.complete.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });
  const enterYield = (input: HTMLInputElement, value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

  it("submits an operator-entered zero actual yield and its batch unit", async () => {
    harness.complete.mockResolvedValue(undefined);
    await act(async () =>
      root.render(
        createElement(MemoryRouter, {}, createElement(KitchenDisplayPage)),
      ),
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Actual yield for Tomato sauce in kg"]',
    )!;
    enterYield(input, "0");
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Done")
        ?.click(),
    );
    expect(harness.complete).toHaveBeenCalledWith({
      docId: "batch-1",
      version: 4,
      actualYield: 0,
    });
  });

  it("retains the entered yield when completion fails", async () => {
    harness.complete.mockRejectedValue(new Error("offline"));
    await act(async () =>
      root.render(
        createElement(MemoryRouter, {}, createElement(KitchenDisplayPage)),
      ),
    );
    const input = container.querySelector<HTMLInputElement>(
      'input[aria-label="Actual yield for Tomato sauce in kg"]',
    )!;
    enterYield(input, "7.5");
    await act(async () =>
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Done")
        ?.click(),
    );
    expect(input.value).toBe("7.5");
    expect(container.textContent).toContain("offline");
  });
});
