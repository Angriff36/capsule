// @vitest-environment jsdom
/**
 * AC-492 (PL-PREP, spec BE-11.4): My Day shows each prep task's remaining
 * work, what is already made, the recipe link, what it waits on, whether it
 * has a prep time, why it is blocked and which event it is for. Actions send
 * the task's current version, so a change made elsewhere is never
 * overwritten with an old copy.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyDayPrepList } from "../../../src/features/staff/MyDayPrepList";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const base = {
  eventId: "event-1",
  eventDishId: "line-1",
  dishId: "dish-1",
  unit: "portion",
  deletedAt: null,
};
const made = {
  ...base,
  _id: "made",
  version: 5,
  dishTaskId: "step-sauce",
  name: "Make sauce",
  status: "completed",
  quantity: 40,
  completedQuantity: 20,
};
const sauce = {
  ...base,
  _id: "sauce",
  version: 2,
  dishTaskId: "step-sauce",
  componentId: "sauce-recipe",
  name: "Make sauce",
  status: "pending",
  quantity: 20,
  dueAt: null,
};
const plate = {
  ...base,
  _id: "plate",
  version: 7,
  dishTaskId: "step-plate",
  name: "Plate chicken",
  status: "claimed",
  quantity: 40,
  dueAt: null,
};
const garnish = {
  ...base,
  _id: "garnish",
  version: 1,
  dishTaskId: "step-garnish",
  name: "Garnish",
  status: "blocked",
  quantity: 40,
  blockReason: "Herbs not delivered",
  dueAt: Date.UTC(2026, 10, 14, 15, 30),
};
const links = [{ dependentTaskId: "plate", predecessorTaskId: "sauce" }];

describe("My Day prep facts and versions (AC-492)", () => {
  let container: HTMLDivElement;
  let root: Root;
  const perform = vi.fn();
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    perform.mockReset();
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = (open: (typeof sauce)[]) =>
    act(async () =>
      root.render(
        createElement(
          MemoryRouter,
          {},
          createElement(MyDayPrepList, {
            tasks: open,
            allTasks: open,
            everyTask: [made, ...open],
            dependencies: links,
            dishes: [{ _id: "dish-1", name: "Roast chicken" }],
            eventDishes: [
              { _id: "line-1", dishId: "dish-1", quantityServings: 40 },
            ],
            events: [{ _id: "event-1", title: "Harbor gala" }],
            busy: null,
            perform,
          }),
        ),
      ),
    );

  const row = (name: string) =>
    Array.from(container.querySelectorAll("li.my-day-prep-row")).find(
      (li) => li.querySelector(".my-day-prep-task-name")?.textContent === name,
    )!;

  it("an unscheduled task shows an explicit unknown-time label and actions surface the updated version", async () => {
    await render([sauce, plate, garnish] as never);
    expect(container.textContent).toContain("Harbor gala");
    expect(container.textContent).toContain("Roast chicken");

    const sauceRow = row("Make sauce");
    expect(sauceRow.textContent).toContain("20 portion to make");
    expect(sauceRow.textContent).toContain("20 portion already made");
    expect(sauceRow.textContent).toContain("No prep time set");
    expect(sauceRow.querySelector("a")?.textContent).toBe("Recipe: Make sauce");

    // Plate waits on the sauce: its Start is locked and says why.
    const plateRow = row("Plate chicken");
    expect(plateRow.textContent).toContain("Waiting on Make sauce");
    // A step with no sub-recipe still leads to its method: the dish steps.
    expect(plateRow.querySelector("a")?.textContent).toBe(
      "Steps for Roast chicken",
    );
    const start = plateRow.querySelector<HTMLButtonElement>(
      'button[aria-label="Start: Plate chicken"]',
    )!;
    expect(start.disabled).toBe(true);

    const garnishRow = row("Garnish");
    expect(garnishRow.textContent).toContain("Blocked: Herbs not delivered");
    expect(garnishRow.textContent).toMatch(/Due /);
    expect(garnishRow.textContent).not.toContain("No prep time set");

    await act(async () =>
      sauceRow
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Claim: Make sauce"]',
        )!
        .click(),
    );
    expect(perform).toHaveBeenLastCalledWith(
      "task:sauce",
      "task-claim",
      "Claim",
      { docId: "sauce", version: 2 },
    );

    // The claim came back as version 3: the next action sends version 3.
    await render([
      { ...sauce, status: "claimed", version: 3 },
      plate,
      garnish,
    ] as never);
    await act(async () =>
      row("Make sauce")
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Start: Make sauce"]',
        )!
        .click(),
    );
    expect(perform).toHaveBeenLastCalledWith(
      "task:sauce",
      "task-start",
      "Start",
      { docId: "sauce", version: 3 },
    );
  });
});
