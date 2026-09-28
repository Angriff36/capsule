// @vitest-environment jsdom
/**
 * AC-489 (PL-PREP, spec BE-11.2): a prep task with no prep time shows as not
 * scheduled. The kitchen display never turns the event start into the task's
 * time. It also shows who has the task, what is already made, why it is
 * blocked and the recipe (AC-492).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KitchenDisplayPage } from "../../../src/features/production/KitchenDisplayPage";
import {
  NO_PREP_TIME,
  prepMadeSoFarLabel,
  prepTimeLabel,
} from "../../../src/features/kitchen/prepTiming";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const EVENT_START = Date.UTC(2026, 10, 14, 17, 0);

const task = (over: Record<string, unknown>) => ({
  eventId: "event-1",
  eventDishId: "line-1",
  dishTaskId: "step-1",
  unit: "portion",
  version: 3,
  deletedAt: null,
  dueAt: null,
  ...over,
});

const tasks = [
  task({
    _id: "made",
    name: "Make sauce",
    status: "completed",
    quantity: 40,
    completedQuantity: 20,
  }),
  task({
    _id: "rest",
    name: "Make sauce",
    status: "claimed",
    quantity: 20,
    assignedToId: "person-1",
    componentId: "sauce-recipe",
  }),
  task({
    _id: "stuck",
    name: "Plate chicken",
    dishTaskId: "step-2",
    status: "blocked",
    quantity: 40,
    blockReason: "Plates still in the dish pit",
  }),
];

vi.mock("../../../src/lib/manifest-convex-react", () => ({
  useListProductionBatch: () => [],
  useListComponent: () => [],
  useListPrepTask: () => tasks,
  useListPrepTaskDependency: () => [],
  useListEvent: () => [
    {
      _id: "event-1",
      title: "Harbor gala",
      startsAt: EVENT_START,
      stage: "approved",
      deletedAt: null,
    },
  ],
  useListPerson: () => [
    { _id: "person-1", givenName: "Rosa", familyName: "Diaz" },
  ],
  useProductionBatchComplete: () => vi.fn(async () => undefined),
  useProductionBatchStart: () => vi.fn(async () => undefined),
  useProductionBatchCancel: () => vi.fn(async () => undefined),
  useListProductionBatchAllocation: () => [],
  useProductionBatchAllocationMarkPortioned: () => vi.fn(async () => undefined),
  usePrepTaskClaim: () => vi.fn(async () => undefined),
  usePrepTaskComplete: () => vi.fn(async () => undefined),
  usePrepTaskStart: () => vi.fn(async () => undefined),
}));

describe("prep with no prep time (AC-489)", () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("a generated task with no explicit due time renders as unscheduled, never an inferred event-start time", async () => {
    await act(async () =>
      root.render(
        createElement(MemoryRouter, {}, createElement(KitchenDisplayPage)),
      ),
    );
    const cards = Array.from(container.querySelectorAll(".kds-card"));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelector(".kds-due")?.textContent).toBe(NO_PREP_TIME);
      expect(card.textContent).not.toMatch(/overdue|Due /);
    }
    // The event start appears nowhere as a task time.
    const startText = new Date(EVENT_START).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(container.textContent).not.toContain(startText);

    const rest = cards.find((card) => card.textContent?.includes("20 portion"));
    expect(rest?.textContent).toContain("20 portion to make");
    expect(rest?.textContent).toContain("Rosa Diaz");
    expect(rest?.textContent).toContain("20 portion already made");
    expect(rest?.querySelector("a")?.textContent).toBe("Recipe: Make sauce");
    const stuck = cards.find((card) =>
      card.textContent?.includes("Plate chicken"),
    );
    expect(stuck?.textContent).toContain(
      "Blocked: Plates still in the dish pit",
    );
    expect(stuck?.textContent).toContain("Not claimed yet");
  });

  it("the shared label says so in plain words, and made-so-far counts only the same step", () => {
    expect(prepTimeLabel(null)).toBe("No prep time set");
    expect(prepTimeLabel(undefined)).toBe("No prep time set");
    expect(prepTimeLabel(EVENT_START)).toMatch(/^Due /);
    expect(prepMadeSoFarLabel(tasks[1] as never, tasks as never)).toBe(
      "20 portion already made",
    );
    expect(prepMadeSoFarLabel(tasks[2] as never, tasks as never)).toBeNull();
  });
});
