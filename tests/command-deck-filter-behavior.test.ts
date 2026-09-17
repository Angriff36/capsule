// @vitest-environment jsdom
import { createElement } from "react";
import { expect, it, vi } from "vitest";
import { container, mount } from "./support/mounted-app";
import { KitchenCommandDeckModel } from "../src/features/kitchen/command-deck/KitchenCommandDeckModel";
import { KitchenCommandDeckHorizon } from "../src/features/kitchen/command-deck/KitchenCommandDeckHorizon";
import { KitchenCommandDeckTaskPanel } from "../src/features/kitchen/command-deck/KitchenCommandDeckTaskPanel";
import { KitchenCommandDeckCrewRail } from "../src/features/kitchen/command-deck/KitchenCommandDeckCrewRail";

it("renders progress for all tasks and matching counts for filtered tasks, with truthful quick-assign guidance", async () => {
  const event = {
    _id: "event-a",
    title: "Harborview supper",
    startsAt: Date.now(),
  };
  const person = { _id: "person-a", givenName: "Ada", familyName: "Cook" };
  const tasks = Array.from({ length: 15 }, (_, i) => ({
    _id: `task-${i}`,
    version: 1,
    eventId: event._id,
    eventDishId: "selection-a",
    name: `Step ${i + 1}`,
    status: "completed",
    quantity: 1,
    unit: "each",
    specialInstructions: '@capsule.menu {"containerCount":1}\nKeep extra spicy',
    assignedToId: person._id,
  }));
  const model = new KitchenCommandDeckModel(
    [event],
    [
      {
        _id: "selection-a",
        eventId: event._id,
        dishId: "dish-a",
        quantityServings: 40,
      },
    ],
    [{ _id: "dish-a", name: "Roast carrots" }],
    tasks,
    [person],
    new KitchenCommandDeckHorizon(7, 0),
  );
  const props = {
    model,
    event,
    assigneeFilter: "",
    armedPersonId: null,
    busy: null,
    prepSyncReady: true,
    componentName: () => null,
    onAssignTask: vi.fn(),
    onAssignDish: vi.fn(),
    onRelease: vi.fn(),
    onClaim: vi.fn(),
    onStart: vi.fn(),
    onComplete: vi.fn(),
    onSyncPrep: vi.fn(),
  };
  await mount(
    createElement(KitchenCommandDeckTaskPanel, { ...props, filter: "all" }),
  );
  expect(container.textContent).toContain("15/15 steps · 100% complete");
  expect(container.textContent).toContain("Keep extra spicy");
  expect(container.textContent).not.toContain("@capsule.menu");
  for (const filter of ["unassigned", "blocked"] as const) {
    await mount(
      createElement(KitchenCommandDeckTaskPanel, { ...props, filter }),
    );
    expect(container.textContent).toContain(
      `0 matching ${filter === "unassigned" ? "Unassigned" : "Blocked"} of 15 steps`,
    );
    expect(container.textContent).not.toContain("100% complete");
  }
  const rail = {
    model,
    people: [person],
    rows: [],
    armedPersonId: person._id,
    onArm: vi.fn(),
  };
  await mount(
    createElement(KitchenCommandDeckCrewRail, { ...rail, assignableInView: 0 }),
  );
  expect(container.querySelector(".kcd-armed-banner")?.textContent).toBe(
    "Armed: Ada Cook — nothing to assign in this filter.",
  );
  await mount(
    createElement(KitchenCommandDeckCrewRail, { ...rail, assignableInView: 2 }),
  );
  expect(container.querySelector(".kcd-armed-banner")?.textContent).toBe(
    "Armed: Ada Cook — click Assign on a task or dish.",
  );
});
